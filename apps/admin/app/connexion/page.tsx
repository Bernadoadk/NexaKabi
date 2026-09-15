import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/session';
import { LoginFlow } from './login-flow';

export const metadata: Metadata = { title: 'Connexion' };

export default async function AdminLoginPage() {
  // Déjà connecté : inutile de redemander. Le garde côté API reste la seule
  // autorité — cette vérification n'est qu'une commodité.
  if (await getAdminUser()) redirect('/');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-5 py-10">
      <LoginFlow />
    </main>
  );
}
