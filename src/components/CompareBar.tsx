import { useCompare } from '@/contexts/CompareContext';
import { useNavigate } from 'react-router-dom';
import { X, GitCompareArrows, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export default function CompareBar() {
  const { items, removeItem, clearAll, isBarOpen } = useCompare();
  const navigate = useNavigate();

  if (!isBarOpen || items.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border shadow-2xl"
      >
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          {/* Products */}
          <div className="flex items-center gap-3 flex-1 overflow-x-auto">
            {items.map((item) => (
              <div
                key={item.product.id}
                className="flex items-center gap-3 bg-secondary rounded-lg px-3 py-2 shrink-0"
              >
                <img
                  src={item.product.images?.[0] || '/placeholder.svg'}
                  alt={item.product.name}
                  className="w-12 h-12 object-contain rounded"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate max-w-[120px]">
                    {item.product.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {item.brandName}
                  </p>
                </div>
                <button
                  onClick={() => removeItem(item.product.id)}
                  className="p-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remover ${item.product.name} da comparação`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: 3 - items.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="w-[180px] h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center shrink-0"
              >
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  + Adicionar
                </span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={clearAll}
              className="p-2.5 rounded-full border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
              aria-label="Limpar comparação"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => navigate('/compare')}
              disabled={items.length < 2}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-foreground text-xs uppercase tracking-[0.15em] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              <GitCompareArrows size={16} />
              Comparar ({items.length})
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
