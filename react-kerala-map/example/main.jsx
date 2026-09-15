import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import KeralaMap, {
  loksabhaPopupHtml,
  assemblyPopupHtml,
  localBodyPopupHtml,
  wardPopupHtml,
} from '../src/index.js';

// Optional `?data=<base-url>` so the demo can be pointed at a different data
// host, e.g. http://localhost:5174/?data=http://localhost:8000/data/
const params = new URLSearchParams(window.location.search);
const dataBaseUrl = params.get('data') || undefined;

// Optional `?electionResults=1` to opt in to the "Election Results" block of
// the built-in popups (off by default), e.g.
//   http://localhost:5174/?electionResults=1
const showElectionResults = params.get('electionResults') === '1';

// Handy for manual debugging and for the end-to-end test: the built-in popup
// builders, so their output can be inspected with and without the flag.
window.keralaMapPopups = {
  loksabhaPopupHtml,
  assemblyPopupHtml,
  localBodyPopupHtml,
  wardPopupHtml,
};

function App() {
  const mapRef = useRef(null);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <KeralaMap
        ref={mapRef}
        dataBaseUrl={dataBaseUrl}
        showElectionResults={showElectionResults}
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
