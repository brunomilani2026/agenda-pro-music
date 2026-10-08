// ⚠️ NÃO importe este módulo no topo de um componente.
//
// O SDK do Firebase (app + storage) pesa ~100-150 KB gzip e só serve ao upload
// de avatar. Importado estaticamente, ele entrava no bundle de toda página que
// renderiza um avatar. Use import() dinâmico dentro do handler do upload:
//
//   const { getAvatarStorage } = await import('@/lib/firebase');
//
// Assim o SDK só é baixado quando o usuário de fato escolhe uma imagem.

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** Storage do Firebase, inicializado sob demanda (uma vez por sessão). */
export async function getAvatarStorage() {
  const [{ initializeApp, getApps }, { getStorage }] = await Promise.all([
    import('firebase/app'),
    import('firebase/storage'),
  ]);
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  return getStorage(app);
}
