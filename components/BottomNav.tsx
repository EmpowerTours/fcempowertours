import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/itinerary', label: 'Build', icon: '✈️' },
  { href: '/passport', label: 'Passport', icon: '📖' },
  { href: '/market', label: 'Market', icon: '🛒' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex justify-around bg-white border-t p-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex flex-col items-center ${pathname === tab.href ? 'text-blue-500' : 'text-gray-500'}`}
        >
          <span className="text-lg">{tab.icon}</span>
          <span className="text-xs">{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
