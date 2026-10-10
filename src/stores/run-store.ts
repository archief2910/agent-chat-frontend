import { create } from "zustand";

type StreamText = { text: string; thinking: string };

type RunStore = {
  streams: Record<string, StreamText>;
  setStream: (runId: string, next: StreamText) => void;
};

export const useRunStore = create<RunStore>((set) => ({
  streams: {},
  setStream: (runId, next) =>
    set((state) => ({
      streams: { ...state.streams, [runId]: next },
    })),
}));
