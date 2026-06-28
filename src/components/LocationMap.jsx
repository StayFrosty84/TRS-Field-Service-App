import { getGoogleKey } from '../lib/addrProvider.js';
import { embedMapSrc, mapsHref } from '../lib/maps.js';
import Icon from './Icon.jsx';

// View-only Google map (free Maps Embed API) for a work-order location, with a Navigate
// button below it. The map renders only when a Google key is configured, a location exists,
// and we're online; the Navigate button works without a key (keyless maps URL).
export default function LocationMap({ text = '', lat, lng }) {
  const hasGps = lat != null && lng != null;
  const loc = { text, ...(hasGps ? { lat, lng } : {}) };
  if (!((text || '').trim() || hasGps)) return null; // no location → render nothing

  const src = navigator.onLine ? embedMapSrc(loc, getGoogleKey()) : null;

  return (
    <div className="map-block">
      {src && (
        <iframe
          className="map-embed"
          title="Location map"
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        style={{ marginTop: 8 }}
        onClick={() => {
          const href = mapsHref(loc, { ios: /iPad|iPhone|iPod/.test(navigator.userAgent) });
          if (href) window.open(href, '_blank');
        }}
      >
        <Icon name="map-pin" /> Navigate
      </button>
    </div>
  );
}
