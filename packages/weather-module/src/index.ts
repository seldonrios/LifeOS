import { Topics, type BaseEvent } from '@lifeos/event-bus';
import type { LifeGraphClient } from '@lifeos/life-graph';
import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-loader';

interface VoiceWeatherPayload {
  location?: unknown;
  utterance?: unknown;
}

interface AgentWorkPayload {
  intent?: unknown;
  utterance?: unknown;
  payload?: unknown;
}

interface GeocodeResult {
  name?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

interface GeocodeResponse {
  results?: GeocodeResult[];
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    weathercode?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    weather_code?: number[];
    weathercode?: number[];
    time?: string[];
  };
}

export interface WeatherModuleOptions {
  fetchFn?: typeof fetch;
  now?: () => Date;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_LOCATION_CHARS = 120;
const MAX_FORECAST_CHARS = 1000;

function createClient(context: ModuleRuntimeContext): LifeGraphClient {
  return context.createLifeGraphClient(
    context.graphPath
      ? {
          graphPath: context.graphPath,
          env: context.env,
        }
      : {
          env: context.env,
        },
  );
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function weatherCodeLabel(code: number | undefined): string {
  if (code === undefined) {
    return 'unknown conditions';
  }
  if (code === 0) return 'clear';
  if (code <= 3) return 'partly cloudy';
  if (code <= 48) return 'foggy';
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'snowy';
  if (code <= 99) return 'stormy';
  return 'mixed conditions';
}

function resolveTimeoutMs(context: ModuleRuntimeContext): number {
  const raw = Number.parseInt(context.env.LIFEOS_WEATHER_TIMEOUT_MS ?? '', 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return raw;
}

function extractLocationFromUtterance(utterance: string): string | null {
  const match = utterance.match(/\b(?:in|for)\s+([a-zA-Z][a-zA-Z\s-]{1,80})/i)?.[1];
  if (!match) {
    return null;
  }
  return match.trim();
}

function resolveLocation(payload: VoiceWeatherPayload): string {
  const direct = getString(payload.location);
  if (direct) {
    return clampText(direct, MAX_LOCATION_CHARS);
  }
  const utterance = getString(payload.utterance);
  if (utterance) {
    const extracted = extractLocationFromUtterance(utterance);
    if (extracted) {
      return clampText(extracted, MAX_LOCATION_CHARS);
    }
  }
  return 'current';
}

async function fetchJson<T>(
  url: string,
  context: ModuleRuntimeContext,
  fetchFn: typeof fetch,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs(context));
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'lifeos-weather-module',
      },
    });
    if (!response.ok) {
      throw new Error(`weather request failed (${response.status})`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveCoordinates(
  location: string,
  context: ModuleRuntimeContext,
  fetchFn: typeof fetch,
): Promise<{ label: string; latitude: number; longitude: number }> {
  const latFromEnv = Number.parseFloat(context.env.LIFEOS_WEATHER_LAT ?? '');
  const lonFromEnv = Number.parseFloat(context.env.LIFEOS_WEATHER_LON ?? '');
  if (Number.isFinite(latFromEnv) && Number.isFinite(lonFromEnv) && location === 'current') {
    const label = context.env.LIFEOS_WEATHER_LOCATION?.trim() || 'current';
    return {
      label: clampText(label, MAX_LOCATION_CHARS),
      latitude: latFromEnv,
      longitude: lonFromEnv,
    };
  }

  const query = encodeURIComponent(location);
  const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${query}&count=1&language=en&format=json`;
  const geocode = await fetchJson<GeocodeResponse>(geocodeUrl, context, fetchFn);
  const best = geocode.results?.[0];
  const latitude = Number(best?.latitude);
  const longitude = Number(best?.longitude);
  if (!best || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !best.name) {
    throw new Error(`no weather geocode result for "${location}"`);
  }

  const label = [best.name, best.country].filter(Boolean).join(', ');
  return {
    label: clampText(label || location, MAX_LOCATION_CHARS),
    latitude,
    longitude,
  };
}

function toDailyCode(daily: ForecastResponse['daily']): number | undefined {
  return daily?.weather_code?.[0] ?? daily?.weathercode?.[0];
}

function toForecastSummary(locationLabel: string, forecast: ForecastResponse): string {
  const currentTemp = forecast.current?.temperature_2m;
  const currentCode = forecast.current?.weather_code ?? forecast.current?.weathercode;
  const windSpeed = forecast.current?.wind_speed_10m;
  const max = forecast.daily?.temperature_2m_max?.[0];
  const min = forecast.daily?.temperature_2m_min?.[0];
  const dailyCode = toDailyCode(forecast.daily);

  const nowPart = Number.isFinite(currentTemp)
    ? `Currently ${Math.round(currentTemp as number)}°C and ${weatherCodeLabel(currentCode)}`
    : `Current conditions are ${weatherCodeLabel(currentCode)}`;
  const windPart = Number.isFinite(windSpeed)
    ? `, wind ${Math.round(windSpeed as number)} km/h`
    : '';
  const dailyPart =
    Number.isFinite(min) && Number.isFinite(max)
      ? ` Next day ${Math.round(min as number)}° to ${Math.round(max as number)}° with ${weatherCodeLabel(dailyCode)}.`
      : '.';
  return clampText(`${locationLabel}: ${nowPart}${windPart}.${dailyPart}`, MAX_FORECAST_CHARS);
}

async function captureWeather(
  payload: VoiceWeatherPayload,
  context: ModuleRuntimeContext,
  fetchFn: typeof fetch,
  now: () => Date,
): Promise<void> {
  const location = resolveLocation(payload);
  const coords = await resolveCoordinates(location, context, fetchFn);
  const forecastUrl =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${coords.latitude}` +
    `&longitude=${coords.longitude}` +
    '&current=temperature_2m,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,weather_code' +
    '&forecast_days=2&timezone=auto';
  const forecast = await fetchJson<ForecastResponse>(forecastUrl, context, fetchFn);
  const summary = toForecastSummary(coords.label, forecast);

  const client = createClient(context);
  const saved = await client.appendWeatherSnapshot({
    location: coords.label,
    forecast: summary,
    timestamp: now().toISOString(),
  });

  await context.publish(
    Topics.lifeos.weatherSnapshotCaptured,
    {
      id: saved.id,
      location: saved.location,
      forecast: saved.forecast,
      timestamp: saved.timestamp,
    },
    'weather-module',
  );
  context.log(`[Weather] Captured forecast for ${saved.location}`);
}

function toVoicePayload(event: BaseEvent<Record<string, unknown>>): VoiceWeatherPayload {
  return {
    location: event.data.location,
    utterance: event.data.utterance,
  };
}

function toAgentPayload(event: BaseEvent<AgentWorkPayload>): VoiceWeatherPayload | null {
  if (event.data.intent !== 'weather') {
    return null;
  }
  const nested =
    event.data.payload &&
    typeof event.data.payload === 'object' &&
    !Array.isArray(event.data.payload)
      ? (event.data.payload as Record<string, unknown>)
      : {};
  return {
    location: nested.location,
    utterance: event.data.utterance,
  };
}

async function handlePayload(
  payload: VoiceWeatherPayload,
  context: ModuleRuntimeContext,
  fetchFn: typeof fetch,
  now: () => Date,
): Promise<void> {
  try {
    await captureWeather(payload, context, fetchFn, now);
  } catch (error: unknown) {
    context.log(`[Weather] live fetch degraded: ${normalizeErrorMessage(error)}`);
    const location = resolveLocation(payload);
    const forecast = clampText(
      `Weather lookup is temporarily unavailable for ${location}.`,
      MAX_FORECAST_CHARS,
    );
    const client = createClient(context);
    const saved = await client.appendWeatherSnapshot({
      location,
      forecast,
      timestamp: now().toISOString(),
    });
    await context.publish(
      Topics.lifeos.weatherSnapshotCaptured,
      {
        id: saved.id,
        location: saved.location,
        forecast: saved.forecast,
        timestamp: saved.timestamp,
        degraded: true,
      },
      'weather-module',
    );
  }
}

export function createWeatherModule(options: WeatherModuleOptions = {}): LifeOSModule {
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? (() => new Date());

  return {
    id: 'weather',
    async init(context: ModuleRuntimeContext): Promise<void> {
      await context.subscribe<Record<string, unknown>>(
        Topics.lifeos.voiceIntentWeather,
        async (event) => {
          await handlePayload(toVoicePayload(event), context, fetchFn, now);
        },
      );
      await context.subscribe<AgentWorkPayload>(Topics.agent.workRequested, async (event) => {
        const payload = toAgentPayload(event);
        if (!payload) {
          return;
        }
        await handlePayload(payload, context, fetchFn, now);
      });
    },
  };
}

export const weatherModule = createWeatherModule();
