import Navbar from './Navbar';
import BubbleBackground from './BubbleBackground';
import CheckinProgress from './CheckinProgress';
import { useCheckin } from '../hooks/useCheckin';

export default function Layout({ children }) {
  const { progress, cancelCheckin, clearProgress } = useCheckin();

  return (
    <div className="min-h-screen relative">
      <BubbleBackground />
      <div className="relative z-10 max-w-6xl mx-auto py-4 space-y-6">
        <Navbar />
        <CheckinProgress
          progress={progress}
          onCancel={cancelCheckin}
          onClear={clearProgress}
        />
        <main className="px-4">{children}</main>
      </div>
    </div>
  );
}
