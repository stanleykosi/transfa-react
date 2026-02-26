import { create } from 'zustand';

interface SensitiveFlowState {
  linkAccountPin: string | null;
  pinChangeCurrentPin: string | null;
  pinChangeNewPin: string | null;
  setLinkAccountPin: (pin: string) => void;
  clearLinkAccountPin: () => void;
  setPinChangeCurrentPin: (pin: string) => void;
  setPinChangeNewPin: (pin: string) => void;
  clearPinChangeFlow: () => void;
}

const normalizePin = (pin: string): string | null => {
  const normalized = pin.replace(/[^0-9]/g, '').slice(0, 4);
  return normalized.length === 4 ? normalized : null;
};

export const useSensitiveFlowStore = create<SensitiveFlowState>((set) => ({
  linkAccountPin: null,
  pinChangeCurrentPin: null,
  pinChangeNewPin: null,

  setLinkAccountPin: (pin: string) => {
    set({ linkAccountPin: normalizePin(pin) });
  },
  clearLinkAccountPin: () => {
    set({ linkAccountPin: null });
  },

  setPinChangeCurrentPin: (pin: string) => {
    set({ pinChangeCurrentPin: normalizePin(pin) });
  },
  setPinChangeNewPin: (pin: string) => {
    set({ pinChangeNewPin: normalizePin(pin) });
  },
  clearPinChangeFlow: () => {
    set({ pinChangeCurrentPin: null, pinChangeNewPin: null });
  },
}));
