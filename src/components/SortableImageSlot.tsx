import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, GripVertical } from 'lucide-react';

interface Props {
  id: string;
  index: number;
  src: string;
  onRemove: () => void;
}

export function SortableImageSlot({ id, index, src, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="aspect-square bg-secondary border-2 border-dashed border-border rounded-lg relative flex items-center justify-center overflow-hidden"
    >
      <img src={src} className="w-full h-full object-contain pointer-events-none select-none" alt="" draggable={false} />

      {/* Drag handle - covers full image area but lets buttons through */}
      <div
        {...attributes}
        {...listeners}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        title="Arraste para reordenar"
      />

      {index === 0 && (
        <span className="absolute top-1 left-1 bg-accent text-accent-foreground text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold pointer-events-none z-10">
          Principal
        </span>
      )}

      <div className="absolute top-1 right-1 z-20 flex gap-1">
        <span className="bg-background/80 text-foreground rounded p-0.5"><GripVertical size={10} /></span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="bg-primary text-primary-foreground rounded-full p-0.5"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  );
}
