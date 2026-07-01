import { Link } from 'react-router-dom';
import highEndImg from '@/assets/segment-highend.jpg';
import premiumImg from '@/assets/segment-premium.jpg';
import essentialImg from '@/assets/segment-essential.jpg';

const segments = [
  { id: 'high', title: 'High-End', desc: 'Design Exclusivo e Materiais Nobres', img: highEndImg },
  { id: 'premium', title: 'Premium', desc: 'Sofisticação e Valor Acessível', img: premiumImg },
  { id: 'essential', title: 'Essential', desc: 'Qualidade e Funcionalidade Refinada', img: essentialImg },
];

export default function SegmentsPage() {
  return (
    <div className="min-h-screen bg-secondary py-20 px-4">
      <div className="max-w-6xl mx-auto text-center mb-16">
        <h2 className="text-4xl font-serif mb-4 text-foreground">Selecione o Padrão</h2>
        <div className="w-20 h-px bg-accent mx-auto" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {segments.map((seg, i) => (
          <Link
            key={seg.id}
            to={`/brands/${seg.id}`}
            className="group relative h-[480px] overflow-hidden cursor-pointer bg-charcoal animate-fade-in"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <img
              src={seg.img}
              className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-110 transition-transform duration-700"
              alt={seg.title}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 to-transparent" />
            <div className="absolute inset-0 flex flex-col items-center justify-end text-primary-foreground p-8 text-center">
              <h3 className="text-3xl font-serif mb-2">{seg.title}</h3>
              <p className="text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500 font-light">
                {seg.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
