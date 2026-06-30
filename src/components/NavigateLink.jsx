import Icon from './Icon.jsx';
import { mapsHref } from '../lib/maps.js';

// iPhones get Apple Maps; everything else gets Google Maps (also works on iOS).
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '');

// Full-width "Navigate" button to turn-by-turn directions for a location
// ({ text, lat, lng }). Renders nothing when there's no location to route to.
export default function NavigateLink({ text, lat, lng, style }) {
  const href = mapsHref({ text, lat, lng }, { ios: isIOS });
  if (!href) return null;
  return (
    <a
      className="btn btn--ghost"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ width: '100%', justifyContent: 'flex-start', ...style }}
    >
      <Icon name="navigation" size={16} /> {text || 'Navigate'}
    </a>
  );
}
