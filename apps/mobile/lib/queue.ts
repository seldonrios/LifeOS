import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { sdk } from './sdk';

export type QueueActionType = 'capture' | 'approve' | 'reject' | 'mark_read';
export type ConflictPolicy = 'last-write-wins' | 'fail-on-conflict';
export type QueueItemStatus = 'pending' | 'syncing' | 'failed';

export type QueueItem = {
  id: string;
  type: QueueActionType;
  payload: Record<string, unknown>;
  createdAt: number;
  retryCount: number;
  conflictPolicy: ConflictPolicy;
  status: QueueItemStatus;
};

type QueueStore = {
  items: QueueItem[];
  enqueue: (item: Omit<QueueItem, 'id' | 'createdAt' | 'retryCount' | 'status'>) => QueueItem;
  dequeue: () => QueueItem | undefined;
  markFailed: (id: string, error: unknown) => void;
  flush: () => Promise<void>;
  clear: () => void;
};

const QUEUE_STORAGE_KEY = 'lifeos.offline_queue';

async function executeQueueItem(item: QueueItem): Promise<void> {
  switch (item.type) {
    case 'capture': {
      await sdk.capture.create(item.payload as never);
      return;
    }
    case 'approve': {
      const requestId = item.payload.requestId;
      if (typeof requestId !== 'string' || requestId.length === 0) {
        throw new Error('Missing requestId for approve queue item.');
      }
      await sdk.inbox.approve(requestId);
      return;
    }
    case 'reject': {
      const requestId = item.payload.requestId;
      const reason = item.payload.reason;
      if (typeof requestId !== 'string' || requestId.length === 0) {
        throw new Error('Missing requestId for reject queue item.');
      }
      await sdk.inbox.reject(requestId, typeof reason === 'string' ? reason : undefined);
      return;
    }
    case 'mark_read': {
      const markRead = (sdk.inbox as unknown as { markRead?: (itemId: string) => Promise<void> }).markRead;
      const itemId = item.payload.itemId;
      if (typeof markRead !== 'function') {
        throw new Error('markRead is not implemented in sdk.inbox.');
      }
      if (typeof itemId !== 'string' || itemId.length === 0) {
        throw new Error('Missing itemId for mark_read queue item.');
      }
      await markRead(itemId);
      return;
    }
    default:
      throw new Error(`Unsupported queue item type: ${String(item.type)}`);
  }
}

export const useQueueStore = create<QueueStore>()(
  persist(
    (set, get) => ({
      items: [],
      enqueue(item) {
        const nextItem: QueueItem = {
          ...item,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          retryCount: 0,
          status: 'pending',
        };

        set((state) => ({ items: [...state.items, nextItem] }));
        return nextItem;
      },
      dequeue() {
        let dequeuedItem: QueueItem | undefined;

        set((state) => {
          const index = state.items.findIndex((item) => item.status === 'pending');
          if (index < 0) {
            return state;
          }

          dequeuedItem = state.items[index];
          const nextItems = [...state.items];
          nextItems.splice(index, 1);
          return { items: nextItems };
        });

        return dequeuedItem;
      },
      markFailed(id, error) {
        void error;
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== id) {
              return item;
            }

            const nextRetryCount = item.retryCount + 1;
            return {
              ...item,
              retryCount: nextRetryCount,
              status: nextRetryCount >= 3 ? 'failed' : 'pending',
            };
          }),
        }));
      },
      async flush() {
        while (true) {
          const nextItem = get().items.find((item) => item.status === 'pending');
          if (!nextItem) {
            return;
          }

          set((state) => ({
            items: state.items.map((item) =>
              item.id === nextItem.id ? { ...item, status: 'syncing' } : item,
            ),
          }));

          try {
            await executeQueueItem(nextItem);
            set((state) => ({
              items: state.items.filter((item) => item.id !== nextItem.id),
            }));
          } catch (error) {
            get().markFailed(nextItem.id, error);
            return;
          }
        }
      },
      clear() {
        set({ items: [] });
      },
    }),
    {
      name: QUEUE_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);