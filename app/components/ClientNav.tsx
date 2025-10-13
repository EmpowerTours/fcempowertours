'use client';
import { useRouter } from 'next/navigation';

export default function ClientNav() {
  const router = useRouter();

  const navigateTo = (path: string) => {
    console.log('ClientNav: Navigating to', path);
    router.push(path);
  };

  console.log('ClientNav: Rendering nav');
  return (
    <nav className="w-full bg-black/50 p-4 flex justify-around border-b border-gray-800">
      <button onClick={() => navigateTo('/')} className="text-white px-4 py-2 rounded hover:bg-gray-700">Home</button>
      <button onClick={() => navigateTo('/passport')} className="text-white px-4 py-2 rounded hover:bg-gray-700">Passport</button>
      <button onClick={() => navigateTo('/music')} className="text-white px-4 py-2 rounded hover:bg-gray-700">Music</button>
      <button onClick={() => navigateTo('/market')} className="text-white px-4 py-2 rounded hover:bg-gray-700">Market</button>
      <button onClick={() => navigateTo('/profile')} className="text-white px-4 py-2 rounded hover:bg-gray-700">Profile</button>
      <button onClick={() => navigateTo('/admin')} className="text-white px-4 py-2 rounded hover:bg-gray-700">Admin</button>
    </nav>
  );
}
