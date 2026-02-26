import { useMemo } from 'react';

export default function BubbleBackground() {
  const bubbles = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      size: Math.random() * 60 + 20,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 5,
      duration: Math.random() * 4 + 6,
      opacity: Math.random() * 0.15 + 0.05,
    })), []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {bubbles.map(b => (
        <div
          key={b.id}
          className="absolute rounded-full"
          style={{
            width: b.size,
            height: b.size,
            left: `${b.left}%`,
            top: `${b.top}%`,
            opacity: b.opacity,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(135,206,250,0.3))',
            animation: `float ${b.duration}s ease-in-out ${b.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
