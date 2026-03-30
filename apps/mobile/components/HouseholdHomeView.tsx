import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sdk } from '../lib/sdk';
import { queryClient } from '../lib/query-client';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { darkColors, lightColors, spacing, typography } from '@lifeos/ui';

type HouseholdHomeViewProps = {
  householdId: string;
};

type HouseholdSection = 'today' | 'chores' | 'shopping' | 'calendar';
type ShoppingStatus = 'added' | 'in_cart' | 'purchased';
type HouseholdMemberStatus = 'active' | 'away' | 'pending';

type ChoreDetail = Awaited<ReturnType<typeof sdk.household.chores.list>>[number];
type ShoppingItem = Awaited<ReturnType<typeof sdk.household.shopping.items>>[number];
type CalendarRow = Awaited<ReturnType<typeof sdk.household.calendar.list>>[number];
type CalendarEvent = Awaited<ReturnType<typeof sdk.household.calendar.events>>[number];

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function isSameDay(aIso: string, b: Date): boolean {
  const a = new Date(aIso);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function initialsForUser(userId: string): string {
  const clean = userId.replace(/[^A-Za-z0-9]/g, ' ').trim();
  if (clean.length === 0) {
    return '?';
  }
  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function statusForMember(status: string): HouseholdMemberStatus {
  const normalized = status.toLowerCase();
  if (normalized === 'active' || normalized === 'joined') {
    return 'active';
  }
  if (normalized === 'pending' || normalized === 'invited') {
    return 'pending';
  }
  return 'away';
}

function formatTime(isoDate: string): string {
  const value = new Date(isoDate);
  return value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);
}

function dayNumber(date: Date): string {
  return String(date.getDate());
}

function weekdayRangeFromToday(): Date[] {
  const today = startOfDay(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() + index);
    return day;
  });
}

function nextShoppingStatus(status: ShoppingStatus): ShoppingStatus {
  if (status === 'added') {
    return 'in_cart';
  }
  if (status === 'in_cart') {
    return 'purchased';
  }
  return 'added';
}

export function HouseholdHomeView({ householdId }: HouseholdHomeViewProps) {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const [activeSection, setActiveSection] = useState<HouseholdSection>('today');

  return (
    <View style={styles.householdRoot}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sectionTabsRow}
      >
        {[
          { key: 'today', label: 'Today' },
          { key: 'chores', label: 'Chores' },
          { key: 'shopping', label: 'Shop' },
          { key: 'calendar', label: 'Cal' },
        ].map((section) => {
          const isActive = activeSection === section.key;
          return (
            <Pressable
              key={section.key}
              onPress={() => setActiveSection(section.key as HouseholdSection)}
              style={[
                styles.sectionTab,
                {
                  borderBottomColor: isActive ? palette.accent.brand : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.sectionTabText,
                  { color: isActive ? palette.accent.brand : palette.text.secondary },
                ]}
              >
                {section.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {activeSection === 'today' ? <HouseholdTodaySection householdId={householdId} /> : null}
      {activeSection === 'chores' ? <HouseholdChoresSection householdId={householdId} /> : null}
      {activeSection === 'shopping' ? <HouseholdShoppingSection householdId={householdId} /> : null}
      {activeSection === 'calendar' ? <HouseholdCalendarSection householdId={householdId} /> : null}
    </View>
  );
}

function HouseholdTodaySection({ householdId }: { householdId: string }) {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const today = startOfDay(new Date());
  const fromIso = startOfDay(today).toISOString();
  const toIso = endOfDay(today).toISOString();

  const { data: chores = [] } = useQuery({
    queryKey: ['household', householdId, 'chores'],
    queryFn: () => sdk.household.chores.list(householdId),
  });

  const { data: calendars = [] } = useQuery({
    queryKey: ['household', householdId, 'calendars'],
    queryFn: () => sdk.household.calendar.list(householdId),
  });

  const { data: memberRows = [] } = useQuery({
    queryKey: ['household', householdId, 'members'],
    queryFn: () => sdk.household.listMembers(householdId),
  });

  const { data: todayEvents = [], isLoading: isEventsLoading } = useQuery({
    queryKey: ['household', householdId, 'calendars', 'events', fromIso, toIso],
    enabled: calendars.length > 0,
    queryFn: async () => {
      const events = await Promise.all(
        calendars.map(async (calendar) => {
          const rows = await sdk.household.calendar.events(householdId, calendar.id, fromIso, toIso);
          return rows;
        }),
      );
      return events.flat();
    },
  });

  const choresDueToday = useMemo(
    () => chores.filter((chore) => isSameDay(chore.dueAt, today)),
    [chores, today],
  );

  return (
    <View style={styles.sectionContent}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.background.card,
            borderColor: palette.border.default,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Who&apos;s home</Text>
        <View style={styles.memberStrip}>
          {memberRows.length === 0 ? (
            <Text style={[styles.mutedText, { color: palette.text.muted }]}>No members yet</Text>
          ) : (
            memberRows.map((member) => {
              const status = statusForMember(member.status);
              return (
                <View key={member.user_id} style={styles.memberBubbleWrap}>
                  <View
                    style={[
                      styles.memberBubble,
                      {
                        backgroundColor:
                          status === 'active' ? palette.text.primary : palette.background.secondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.memberInitials,
                        {
                          color:
                            status === 'active'
                              ? palette.background.primary
                              : palette.text.secondary,
                        },
                      ]}
                    >
                      {initialsForUser(member.user_id)}
                    </Text>
                    <View
                      style={[
                        styles.presenceDot,
                        {
                          backgroundColor:
                            status === 'active' ? '#20C997' : status === 'pending' ? '#ADB5BD' : '#6C757D',
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.background.card,
            borderColor: palette.border.default,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Today&apos;s events</Text>
        {isEventsLoading ? (
          <ActivityIndicator size="small" color={palette.accent.brand} />
        ) : todayEvents.length === 0 ? (
          <Text style={[styles.mutedText, { color: palette.text.muted }]}>No events today</Text>
        ) : (
          todayEvents.map((event) => (
            <View key={event.id} style={styles.rowLine}>
              <View
                style={[
                  styles.eventDot,
                  {
                    backgroundColor: event.calendarColor,
                  },
                ]}
              />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: palette.text.primary }]}>{event.title}</Text>
                <Text style={[styles.rowMeta, { color: palette.text.secondary }]}>
                  {formatTime(event.startAt)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: palette.background.card,
            borderColor: palette.border.default,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text.secondary }]}>Chores due today</Text>
        {choresDueToday.length === 0 ? (
          <Text style={[styles.mutedText, { color: palette.text.muted }]}>No chores due today</Text>
        ) : (
          choresDueToday.map((chore) => (
            <View key={chore.id} style={styles.rowLine}>
              <View
                style={[
                  styles.checkCircle,
                  {
                    borderColor: palette.border.default,
                  },
                ]}
              />
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: palette.text.primary }]}>{chore.title}</Text>
                <Text style={[styles.rowMeta, { color: palette.text.secondary }]}>
                  {chore.assignedTo.displayName}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function HouseholdChoresSection({ householdId }: { householdId: string }) {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const [loadingChoreId, setLoadingChoreId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = startOfDay(new Date());

  const { data: chores = [], isLoading } = useQuery({
    queryKey: ['household', householdId, 'chores'],
    queryFn: () => sdk.household.chores.list(householdId),
  });

  const dueOrOverdue = chores.filter((chore) => chore.isOverdue || isSameDay(chore.dueAt, today));
  const upcoming = chores.filter(
    (chore) => !chore.isOverdue && !isSameDay(chore.dueAt, today) && chore.status !== 'completed',
  );
  const completedThisWeek = chores.filter((chore) => chore.status === 'completed');

  const completeChore = useCallback(
    async (choreId: string) => {
      setError(null);
      setLoadingChoreId(choreId);
      try {
        await sdk.household.chores.complete(householdId, choreId);
        await queryClient.invalidateQueries({ queryKey: ['household', householdId, 'chores'] });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Unable to complete chore';
        setError(message);
      } finally {
        setLoadingChoreId(null);
      }
    },
    [householdId],
  );

  const renderChore = (chore: ChoreDetail) => (
    <View
      key={chore.id}
      style={[
        styles.choreCard,
        {
          borderColor: palette.border.default,
          backgroundColor: palette.background.card,
        },
        chore.isOverdue
          ? {
              borderLeftWidth: 3,
              borderLeftColor: palette.accent.danger,
            }
          : null,
      ]}
    >
      <Pressable
        style={[
          styles.completeCircle,
          {
            borderColor: palette.border.default,
          },
        ]}
        disabled={loadingChoreId !== null}
        onPress={() => {
          void completeChore(chore.id);
        }}
      >
        {loadingChoreId === chore.id ? (
          <ActivityIndicator size="small" color={palette.accent.brand} />
        ) : chore.status === 'completed' ? (
          <Text style={[styles.completedMark, { color: palette.accent.brand }]}>✓</Text>
        ) : null}
      </Pressable>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: palette.text.primary }]}>{chore.title}</Text>
        <Text style={[styles.rowMeta, { color: palette.text.secondary }]}> 
          {chore.recurrenceRule ?? 'One-time'}
        </Text>
      </View>
      <View style={styles.choreMetaRight}>
        <View style={[styles.assigneeAvatar, { backgroundColor: palette.background.secondary }]}>
          <Text style={[styles.assigneeInitials, { color: palette.text.secondary }]}>
            {initialsForUser(chore.assignedTo.userId)}
          </Text>
        </View>
        {chore.status === 'completed' ? (
          <Text style={[styles.streakBadge, { color: palette.accent.warning }]}>🔥 {chore.streakCount} wk</Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.sectionContent}>
      {error ? <Text style={[styles.errorText, { color: palette.accent.danger }]}>{error}</Text> : null}
      {isLoading ? <ActivityIndicator size="small" color={palette.accent.brand} /> : null}

      <Text style={[styles.groupTitle, { color: palette.text.secondary }]}>Due today / overdue</Text>
      {dueOrOverdue.length === 0 ? (
        <Text style={[styles.mutedText, { color: palette.text.muted }]}>None</Text>
      ) : (
        dueOrOverdue.map(renderChore)
      )}

      <Text style={[styles.groupTitle, { color: palette.text.secondary }]}>Upcoming</Text>
      {upcoming.length === 0 ? (
        <Text style={[styles.mutedText, { color: palette.text.muted }]}>None</Text>
      ) : (
        upcoming.map(renderChore)
      )}

      <Text style={[styles.groupTitle, { color: palette.text.secondary }]}>Completed this week</Text>
      {completedThisWeek.length === 0 ? (
        <Text style={[styles.mutedText, { color: palette.text.muted }]}>None</Text>
      ) : (
        completedThisWeek.map(renderChore)
      )}
    </View>
  );
}

function HouseholdShoppingSection({ householdId }: { householdId: string }) {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPurchased, setShowPurchased] = useState(false);

  const { data: lists = [] } = useQuery({
    queryKey: ['household', householdId, 'shopping', 'lists'],
    queryFn: () => sdk.household.shopping.lists(householdId),
  });

  const listId = lists[0]?.id;
  const itemsKey = ['household', householdId, 'shopping', 'items', listId] as const;

  const { data: items = [] } = useQuery({
    queryKey: itemsKey,
    enabled: Boolean(listId),
    queryFn: () => sdk.household.shopping.items(householdId, listId as string),
  });

  const toGet = items.filter((item) => item.status !== 'purchased');
  const purchased = items.filter((item) => item.status === 'purchased');

  const handleAdd = useCallback(async () => {
    const nextTitle = title.trim();
    if (!listId || nextTitle.length === 0) {
      return;
    }

    setError(null);
    setLoading(true);

    const previous = queryClient.getQueryData<ShoppingItem[]>(itemsKey) ?? [];
    const optimistic: ShoppingItem = {
      id: `optimistic-${Date.now()}`,
      title: nextTitle,
      addedBy: 'me',
      status: 'added',
      addedAt: new Date().toISOString(),
      purchasedAt: null,
    };

    queryClient.setQueryData<ShoppingItem[]>(itemsKey, [optimistic, ...previous]);
    setTitle('');

    try {
      await sdk.household.shopping.addItem(householdId, listId, nextTitle, 'manual');
      await queryClient.invalidateQueries({ queryKey: itemsKey });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to add item';
      setError(message);
      queryClient.setQueryData<ShoppingItem[]>(itemsKey, previous);
    } finally {
      setLoading(false);
    }
  }, [householdId, itemsKey, listId, title]);

  const cycleStatus = useCallback(
    async (item: ShoppingItem) => {
      const next = nextShoppingStatus(item.status as ShoppingStatus);
      const previous = queryClient.getQueryData<ShoppingItem[]>(itemsKey) ?? [];
      queryClient.setQueryData<ShoppingItem[]>(
        itemsKey,
        previous.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: next,
                purchasedAt: next === 'purchased' ? new Date().toISOString() : null,
              }
            : entry,
        ),
      );

      try {
        await sdk.household.shopping.updateStatus(householdId, item.id, next);
        await queryClient.invalidateQueries({ queryKey: itemsKey });
      } catch {
        queryClient.setQueryData<ShoppingItem[]>(itemsKey, previous);
      }
    },
    [householdId, itemsKey],
  );

  return (
    <View style={styles.sectionContent}>
      {error ? <Text style={[styles.errorText, { color: palette.accent.danger }]}>{error}</Text> : null}
      <View style={styles.fastAddRow}>
        <TextInput
          style={[
            styles.fastAddInput,
            {
              borderColor: palette.border.default,
              color: palette.text.primary,
              backgroundColor: palette.background.card,
            },
          ]}
          value={title}
          onChangeText={setTitle}
          placeholder="Add milk, bread, eggs..."
          placeholderTextColor={palette.text.muted}
        />
        <Pressable
          style={[styles.addButton, { backgroundColor: palette.accent.brand, opacity: loading ? 0.7 : 1 }]}
          onPress={() => {
            void handleAdd();
          }}
          disabled={loading || !listId}
        >
          <Text style={[styles.addButtonText, { color: palette.background.primary }]}>Add</Text>
        </Pressable>
        <Pressable
          style={[styles.voiceButton, { borderColor: palette.border.default }]}
          onPress={() => Alert.alert('Coming soon', 'Voice add will be available in a future update.')}
        >
          <Text style={[styles.voiceText, { color: palette.text.secondary }]}>🎤</Text>
        </Pressable>
      </View>

      <Text style={[styles.groupTitle, { color: palette.text.secondary }]}>To get</Text>
      {toGet.length === 0 ? (
        <Text style={[styles.mutedText, { color: palette.text.muted }]}>No pending items</Text>
      ) : (
        toGet.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.shoppingItem, { borderColor: palette.border.default, backgroundColor: palette.background.card }]}
            onPress={() => {
              void cycleStatus(item);
            }}
          >
            <Text style={[styles.rowTitle, { color: palette.text.primary }]}>{item.title}</Text>
            <Text style={[styles.rowMeta, { color: palette.text.secondary }]}>{item.status.replace('_', ' ')}</Text>
          </Pressable>
        ))
      )}

      <Pressable
        style={styles.purchasedToggle}
        onPress={() => setShowPurchased((current) => !current)}
      >
        <Text style={[styles.rowMeta, { color: palette.text.secondary }]}>▸ {purchased.length} purchased today</Text>
      </Pressable>

      {showPurchased
        ? purchased.map((item) => (
            <View
              key={item.id}
              style={[styles.shoppingItem, { borderColor: palette.border.default, backgroundColor: palette.background.secondary }]}
            >
              <Text style={[styles.rowTitle, { color: palette.text.secondary }]}>{item.title}</Text>
              <Text style={[styles.rowMeta, { color: palette.text.muted }]}>purchased</Text>
            </View>
          ))
        : null}
    </View>
  );
}

function HouseholdCalendarSection({ householdId }: { householdId: string }) {
  const colorScheme = useColorScheme();
  const palette = colorScheme === 'dark' ? darkColors : lightColors;
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const weekDays = useMemo(
    () => weekdayRangeFromToday() as [Date, Date, Date, Date, Date, Date, Date],
    [],
  );

  const { data: calendars = [] } = useQuery({
    queryKey: ['household', householdId, 'calendars'],
    queryFn: () => sdk.household.calendar.list(householdId),
  });

  const selectedCalendar = calendars[0];
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const weekFrom = startOfDay(weekStart).toISOString();
  const weekTo = endOfDay(weekEnd).toISOString();

  const { data: weekEvents = [] } = useQuery({
    queryKey: ['household', householdId, 'calendar', 'events', weekFrom, weekTo, selectedCalendar?.id],
    enabled: Boolean(selectedCalendar),
    queryFn: () =>
      sdk.household.calendar.events(householdId, (selectedCalendar as CalendarRow).id, weekFrom, weekTo),
  });

  const selectedDayEvents = useMemo(
    () => weekEvents.filter((event) => isSameDay(event.startAt, selectedDay)),
    [selectedDay, weekEvents],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    weekDays.forEach((day) => {
      const key = startOfDay(day).toISOString();
      map.set(
        key,
        weekEvents.filter((event) => isSameDay(event.startAt, day)),
      );
    });
    return map;
  }, [weekDays, weekEvents]);

  const handleShareIcs = useCallback(async () => {
    if (!selectedCalendar) {
      return;
    }

    setShareError(null);
    setSharing(true);
    try {
      const icsUrl = await sdk.household.calendar.exportIcs(householdId, selectedCalendar.id);
      await Share.share({ url: icsUrl, message: icsUrl });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to export calendar';
      setShareError(message);
    } finally {
      setSharing(false);
    }
  }, [householdId, selectedCalendar]);

  if (!selectedCalendar) {
    return (
      <View style={styles.sectionContent}>
        <Text style={[styles.mutedText, { color: palette.text.muted }]}>No household calendar found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.sectionContent}>
      {shareError ? <Text style={[styles.errorText, { color: palette.accent.danger }]}>{shareError}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
        {weekDays.map((day) => {
          const isToday = isSameDay(day.toISOString(), new Date());
          const isSelected = isSameDay(day.toISOString(), selectedDay);
          const key = startOfDay(day).toISOString();
          const hasEvents = (eventsByDay.get(key) ?? []).length > 0;

          return (
            <Pressable
              key={key}
              onPress={() => setSelectedDay(startOfDay(day))}
              style={[
                styles.dayCell,
                {
                  borderColor: palette.border.default,
                  backgroundColor: isToday ? palette.accent.brand : palette.background.card,
                },
                isSelected ? styles.dayCellSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.dayLabel,
                  { color: isToday ? palette.background.primary : palette.text.secondary },
                ]}
              >
                {formatDayLabel(day)}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  { color: isToday ? palette.background.primary : palette.text.primary },
                ]}
              >
                {dayNumber(day)}
              </Text>
              {hasEvents ? (
                <View
                  style={[
                    styles.dayEventDot,
                    {
                      backgroundColor: isToday ? palette.background.primary : palette.accent.brand,
                    },
                  ]}
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedDayEvents.length === 0 ? (
        <Text style={[styles.mutedText, { color: palette.text.muted }]}>No events for selected day</Text>
      ) : (
        selectedDayEvents.map((event) => (
          <View
            key={event.id}
            style={[styles.eventCard, { borderColor: palette.border.default, backgroundColor: palette.background.card }]}
          >
            <View style={[styles.eventDot, { backgroundColor: event.calendarColor }]} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowTitle, { color: palette.text.primary }]}>{event.title}</Text>
              <Text style={[styles.rowMeta, { color: palette.text.secondary }]}> 
                {formatTime(event.startAt)} • {event.status}
              </Text>
            </View>
          </View>
        ))
      )}

      <Pressable
        style={[styles.exportButton, { borderColor: palette.border.default, opacity: sharing ? 0.7 : 1 }]}
        onPress={() => {
          void handleShareIcs();
        }}
        disabled={sharing}
      >
        <Text style={[styles.exportButtonText, { color: palette.text.primary }]}>Export ICS</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  householdRoot: {
    gap: spacing[3],
  },
  sectionTabsRow: {
    gap: spacing[4],
    paddingRight: spacing[4],
  },
  sectionTab: {
    borderBottomWidth: 2,
    paddingBottom: spacing[1],
  },
  sectionTabText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  sectionContent: {
    gap: spacing[3],
  },
  card: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[4],
    gap: spacing[2],
  },
  cardTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  mutedText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
  },
  memberStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  memberBubbleWrap: {
    position: 'relative',
  },
  memberBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  memberInitials: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  presenceDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  rowBody: {
    flex: 1,
    gap: spacing[1],
  },
  rowTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  rowMeta: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
  },
  groupTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  choreCard: {
    borderWidth: 1,
    borderRadius: spacing[3],
    padding: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  completeCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedMark: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  choreMetaRight: {
    alignItems: 'flex-end',
    gap: spacing[1],
  },
  assigneeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assigneeInitials: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  streakBadge: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  fastAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  fastAddInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: typography.fontSize.base,
  },
  addButton: {
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  addButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  voiceButton: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  voiceText: {
    fontSize: typography.fontSize.base,
  },
  shoppingItem: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  purchasedToggle: {
    paddingVertical: spacing[1],
  },
  weekStrip: {
    gap: spacing[2],
    paddingRight: spacing[4],
  },
  dayCell: {
    borderWidth: 1,
    borderRadius: spacing[2],
    width: 52,
    paddingVertical: spacing[2],
    alignItems: 'center',
    gap: spacing[1],
  },
  dayCellSelected: {
    borderWidth: 2,
  },
  dayLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  dayNumber: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
  dayEventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eventCard: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
  },
  exportButton: {
    borderWidth: 1,
    borderRadius: spacing[2],
    paddingVertical: spacing[2],
    alignItems: 'center',
  },
  exportButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
