import Icon from './Icon.jsx';
import { telHref, smsHref, fmtPhone } from '../lib/format.js';

// One phone rendered as a full-width tap-to-call button with a compact tap-to-text
// button docked on its right. `style` lets the parent control row spacing.
export default function PhoneRow({ phone, style }) {
  return (
    <div className="row" style={{ gap: 8, ...style }}>
      <a
        className="btn btn--ghost"
        href={telHref(phone)}
        style={{ flex: 1, width: 'auto', justifyContent: 'flex-start' }}
      >
        <Icon name="phone" size={16} /> {phone.label ? `${phone.label}: ` : ''}
        {fmtPhone(phone)}
      </a>
      <a
        className="btn btn--ghost"
        href={smsHref(phone)}
        aria-label={`Text ${fmtPhone(phone)}`}
        style={{ flex: '0 0 auto', width: 'auto' }}
      >
        <Icon name="message-square" size={16} />
      </a>
    </div>
  );
}
