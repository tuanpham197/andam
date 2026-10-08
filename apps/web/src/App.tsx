import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from './app/routes';
import { setupApiClient } from './lib/api';
import { createQueryClient, persistOptions } from './lib/query-cache';

setupApiClient();

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [persist] = useState(() => persistOptions(queryClient));
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persist}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  );
}
