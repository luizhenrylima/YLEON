import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;

interface CompareItem {
  product: Product;
  brandName: string;
}

interface CompareContextType {
  items: CompareItem[];
  addItem: (product: Product, brandName: string) => void;
  removeItem: (productId: string) => void;
  clearAll: () => void;
  isInCompare: (productId: string) => boolean;
  isBarOpen: boolean;
  setBarOpen: (v: boolean) => void;
}

const CompareContext = createContext<CompareContextType | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CompareItem[]>([]);
  const [isBarOpen, setBarOpen] = useState(false);

  const addItem = useCallback((product: Product, brandName: string) => {
    setItems(prev => {
      if (prev.length >= 3) return prev;
      if (prev.some(i => i.product.id === product.id)) return prev;
      return [...prev, { product, brandName }];
    });
    setBarOpen(true);
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems(prev => {
      const next = prev.filter(i => i.product.id !== productId);
      if (next.length === 0) setBarOpen(false);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setBarOpen(false);
  }, []);

  const isInCompare = useCallback((productId: string) => {
    return items.some(i => i.product.id === productId);
  }, [items]);

  return (
    <CompareContext.Provider value={{ items, addItem, removeItem, clearAll, isInCompare, isBarOpen, setBarOpen }}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used within CompareProvider');
  return ctx;
}
