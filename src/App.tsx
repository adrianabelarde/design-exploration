import { lazy, Suspense, useEffect, useState } from 'react';
import ContractPage from './pages/ContractPage';

const TicketPage = lazy(() => import('./pages/TicketPage'));
const ReelPage = lazy(() => import('./pages/ReelPage'));
const TalkPage = lazy(() => import('./presentation/TalkPage'));

type Route = 'contract' | 'ticket' | 'reel' | 'talk';

function routeFromHash(): Route {
  if (window.location.hash.startsWith('#/talk')) return 'talk';
  if (window.location.hash.startsWith('#/ticket')) return 'ticket';
  if (window.location.hash.startsWith('#/reel')) return 'reel';
  return 'contract';
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route === 'talk') {
    return (
      <Suspense fallback={<main className="stage" />}>
        <TalkPage />
      </Suspense>
    );
  }

  return (
    <>
      <nav className="site-nav" aria-label="Demos">
        <a href="#/" className={route === 'contract' ? 'is-current' : ''}>
          etch a sketch
        </a>
        <span aria-hidden="true">/</span>
        <a href="#/ticket" className={route === 'ticket' ? 'is-current' : ''}>
          polar express
        </a>
        <span aria-hidden="true">/</span>
        <a href="#/reel" className={route === 'reel' ? 'is-current' : ''}>
          view master
        </a>
        <span aria-hidden="true">/</span>
        <a href="#/talk">
          talk
        </a>
      </nav>
      {route === 'contract' ? (
        <ContractPage />
      ) : route === 'ticket' ? (
        <Suspense fallback={<main className="stage" />}>
          <TicketPage />
        </Suspense>
      ) : (
        <Suspense fallback={<main className="stage" />}>
          <ReelPage />
        </Suspense>
      )}
    </>
  );
}
