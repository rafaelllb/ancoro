/**
 * Estado de interface (não-modelo): painéis recolhíveis e aba ativa das propriedades. Persistido em localStorage.
 * [2026-10-14] Criado: painel direito (e paleta) ocultáveis para ampliar a área do diagrama — Rafael Brito
 */
import { create } from 'zustand';

export type PanelTab = 'general' | 'docs' | 'people' | 'execution' | 'data' | 'attrs' | 'look' | 'links';

interface UiState {
  rightOpen: boolean;
  leftOpen: boolean;
  tab: PanelTab;
  toggleRight: () => void;
  toggleLeft: () => void;
  setTab: (t: PanelTab) => void;
}

const KEY = 'ps-ui-v1';
const load = (): Pick<UiState, 'rightOpen' | 'leftOpen' | 'tab'> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<UiState>;
    return { rightOpen: v.rightOpen ?? true, leftOpen: v.leftOpen ?? true, tab: v.tab ?? 'general' };
  } catch { return { rightOpen: true, leftOpen: true, tab: 'general' }; }
};

export const useUi = create<UiState>((set, get) => {
  const save = () => { try { const { rightOpen, leftOpen, tab } = get(); localStorage.setItem(KEY, JSON.stringify({ rightOpen, leftOpen, tab })); } catch { /* storage indisponível: preferência não persiste */ } };
  return {
    ...load(),
    toggleRight: () => { set((s) => ({ rightOpen: !s.rightOpen })); save(); },
    toggleLeft: () => { set((s) => ({ leftOpen: !s.leftOpen })); save(); },
    setTab: (tab) => { set({ tab }); save(); },
  };
});
