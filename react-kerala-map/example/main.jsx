import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import KeralaMap from '../src/index.js';

// Optional `?data=<base-url>` so the demo can be pointed at a different data
// host, e.g. http://localhost:5174/?data=http://localhost:8000/data/
const dataBaseUrl =
  new URLSearchParams(window.location.search).get('data') || undefined;

function App() {
  const mapRef = useRef(null);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <KeralaMap
        ref={mapRef}
        dataBaseUrl={dataBaseUrl}
        onSelectionChange={(selection) => console.log('[kerala-map] selection:', selection)}
        onReady={({ lookup }) => {
          console.log(
            `[kerala-map] ready — ${Object.keys(lookup).length} local bodies indexed`
          );
          // Handy for manual debugging from the browser console.
          window.keralaMap = mapRef.current;
        }}
        onError={(error) => console.error('[kerala-map] error:', error)}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
