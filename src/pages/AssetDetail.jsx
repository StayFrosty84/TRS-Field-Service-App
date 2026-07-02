import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteAsset, assetHistory } from '../db/db.js';
import { assetLabel } from '../lib/assets.js';
import { fmtDate } from '../lib/format.js';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';

export default function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const data = useLiveQuery(async () => {
    const asset = await db.assets.get(id);
    if (!asset) return { missing: true };
    const account = await db.accounts.get(asset.accountId);
    const orders = await assetHistory(id);
    return { asset, account, orders };
  }, [id]);

  if (!data) return null;
  if (data.missing) return <p className="muted">Asset not found.</p>;
  const { asset, account, orders } = data;

  async function onDelete() {
    if (!confirm(`Delete "${assetLabel(asset)}"? Past work orders keep their unit # snapshot.`)) return;
    await deleteAsset(id);
    toast('Asset deleted');
    navigate(account ? `/accounts/${account.id}` : '/accounts');
  }

  return (
    <>
      <h1 style={{ marginTop: 4 }}>{assetLabel(asset)}</h1>
      <div className="card">
        {account && (
          <div>
            <Icon name="building" size={15} /> <Link to={`/accounts/${account.id}`}>{account.name}</Link>
          </div>
        )}
        {asset.plate && <div style={{ marginTop: 8 }}><span className="muted">Plate</span> {asset.plate}</div>}
        {asset.vin && <div style={{ marginTop: 8 }}><span className="muted">VIN</span> {asset.vin}</div>}
        {asset.mileage !== '' && asset.mileage != null && (
          <div style={{ marginTop: 8 }}><span className="muted">Mileage</span> {asset.mileage.toLocaleString()}</div>
        )}
        {asset.notes && <div className="muted" style={{ marginTop: 8 }}>{asset.notes}</div>}
      </div>

      <div className="btn-row">
        <button className="btn btn--ghost" onClick={() => navigate(`/assets/${id}/edit`)}>
          Edit
        </button>
      </div>

      <div className="section-title">Past jobs ({orders.length})</div>
      <div className="list">
        {orders.length === 0 && <p className="muted">No work orders for this asset yet.</p>}
        {orders.map((o) => (
          <Link key={o.id} className="list-item" to={`/work-orders/${o.id}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <p className="list-item__title">{o.issue ? o.issue.slice(0, 60) : 'Work order'}</p>
              <span className={`badge badge--${o.status}`}>{o.status}</span>
            </div>
            <p className="list-item__sub">{fmtDate(o.serviceDate)}</p>
          </Link>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn btn--danger" onClick={onDelete}>
          Delete asset
        </button>
      </div>
    </>
  );
}
