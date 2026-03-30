import { createEnvSecretStore, startService } from "@lifeos/service-runtime";
import { createEventBusClient } from '@lifeos/event-bus';
import { HouseholdGraphClient, registerAuditInterceptor } from '@lifeos/household-identity-module';

import { registerHouseholdRoutes } from './routes/household';

startService({
  serviceName: "dashboard-service",
  port: 3000,
  secretRefs: [{ name: 'LIFEOS_SESSION_SECRET', policy: 'optional' }],
  secretStore: createEnvSecretStore(),
  registerRoutes: async (app) => {
    const householdGraphClient = new HouseholdGraphClient(process.env.LIFEOS_HOUSEHOLD_DB_PATH);
    householdGraphClient.initializeSchema();
    const eventBus = createEventBusClient({
      env: process.env,
      allowInMemoryFallback: false,
    });

    await registerAuditInterceptor(eventBus, householdGraphClient);
    registerHouseholdRoutes(app, householdGraphClient, eventBus);

    app.addHook('onClose', async () => {
      await eventBus.close();
    });

    app.get('/', async (_request, reply) => {
      reply.type('text/html; charset=utf-8');
      return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LifeOS Dashboard</title>
    <link rel="stylesheet" href="/assets/dashboard.css" />
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Local-first personal AI</p>
        <h1>Welcome to LifeOS</h1>
        <p class="lede">
          Your plans, routines, and memory in one calm command center.
          Start small, stay consistent, and let the system keep your momentum moving.
        </p>
      </section>

      <section class="card-grid">
        <article class="card">
          <h2>Get Started Fast</h2>
          <ol>
            <li>Run <code>pnpm lifeos status</code></li>
            <li>Create a goal with <code>pnpm lifeos goal "Plan my week"</code></li>
            <li>Review next actions with <code>pnpm lifeos next</code></li>
          </ol>
        </article>

        <article class="card">
          <h2>Daily Rhythm</h2>
          <ul>
            <li>Morning: <code>pnpm lifeos voice briefing</code></li>
            <li>Midday: <code>pnpm lifeos task next</code></li>
            <li>Evening: <code>pnpm lifeos review --period daily</code></li>
          </ul>
        </article>

        <article class="card">
          <h2>Helpful APIs</h2>
          <ul>
            <li><code>/health/live</code></li>
            <li><code>/health/ready</code></li>
            <li><code>/api/welcome</code></li>
          </ul>
        </article>
      </section>
    </main>
  </body>
</html>`;
    });

    app.get('/assets/dashboard.css', async (_request, reply) => {
      reply.type('text/css; charset=utf-8');
      return `:root {
  --bg: #f3f5ef;
  --ink: #14281d;
  --accent: #1f7a4f;
  --accent-soft: #cdebd7;
  --card: #ffffff;
  --ring: #8ac9a5;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: "Segoe UI", "Trebuchet MS", sans-serif;
  color: var(--ink);
  background:
    radial-gradient(circle at 20% 15%, #d9f0e0 0%, transparent 35%),
    radial-gradient(circle at 85% 10%, #f6e9c6 0%, transparent 30%),
    var(--bg);
  min-height: 100vh;
}

.shell {
  max-width: 1040px;
  margin: 0 auto;
  padding: 2.5rem 1.2rem 3rem;
}

.hero {
  background: linear-gradient(140deg, #ffffff 0%, #eef6ee 100%);
  border: 1px solid #d7e8dc;
  border-radius: 20px;
  padding: 1.6rem 1.4rem;
  box-shadow: 0 12px 30px rgba(26, 68, 48, 0.08);
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.74rem;
  color: #336b4f;
  margin: 0 0 0.45rem;
}

h1 {
  margin: 0;
  line-height: 1.1;
  font-size: clamp(1.8rem, 2.8vw, 2.8rem);
}

.lede {
  margin: 0.9rem 0 0;
  max-width: 58ch;
  font-size: 1.02rem;
  line-height: 1.55;
}

.card-grid {
  margin-top: 1.2rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.9rem;
}

.card {
  background: var(--card);
  border: 1px solid #dde9e0;
  border-radius: 16px;
  padding: 1rem;
  box-shadow: 0 8px 22px rgba(20, 40, 29, 0.06);
}

.card h2 {
  margin: 0 0 0.65rem;
  font-size: 1.08rem;
}

ul,
ol {
  margin: 0;
  padding-left: 1.15rem;
  line-height: 1.55;
}

code {
  font-family: "Consolas", "Courier New", monospace;
  font-size: 0.92em;
  background: var(--accent-soft);
  border: 1px solid var(--ring);
  border-radius: 6px;
  padding: 0.08rem 0.32rem;
}

@media (max-width: 640px) {
  .shell {
    padding-top: 1.2rem;
  }

  .hero {
    padding: 1.1rem;
  }
}`;
    });

    app.get('/api/welcome', async () => ({
      product: 'LifeOS',
      message: 'Welcome back. Your local AI node is online and ready to help.',
      tips: [
        'Use `lifeos status` for your current snapshot.',
        'Use `lifeos goal "..."` to create a practical plan.',
        'Use `lifeos next` when you want the highest-impact next actions.',
      ],
    }));
  },
});