import { useMemo } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, listStages, PROFILE_ID } from '../db/db.js';
import { money, fmtDate } from '../lib/format.js';
import { unpaidBills } from '../lib/unpaid.js';
import { useFeatures } from '../lib/useFeatures.js';
import { resolveStage, stageColorClass, isStuck, daysInCurrentStage } from '../lib/stages.js';
import BackupReminder from '../components/BackupReminder.jsx';
import Icon from '../components/Icon.jsx';

export default function Home() {
  const navigate = useNavigate();
  const features = useFeatures();

  const data = useLiveQuery(async () => {
    const orders = await db.workOrders.orderBy('createdAt').reverse().toArray();
    const accounts = Object.fromEntries((await db.accounts.toArray()).map((a) => [a.id, a]));
    const bills = await db.billsOfSale.orderBy('createdAt').reverse().toArray();
    const ordersById = Object.fromEntries(orders.map((o) => [o.id, o]));
    const stages = await listStages();
    const profile = await db.businessProfile.get(PROFILE_ID);
    return { orders, accounts, bills, ordersById, stages, stuckDays: profile?.stuckDays ?? 7 };
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const stages = data.stages || [];
    let outstanding = 0;
    let mtd = 0;
    for (const b of data.bills) {
      if (b.paymentStatus !== 'paid') outstanding += b.total || 0;
      if ((b.billDate || b.pdfGeneratedAt || b.createdAt || 0) >= monthStart) mtd += b.total || 0;
    }
    // Count by the resolved stage's terminal flag (honest once admins add
    // mid-pipeline stages); falls back to the legacy status when no stages exist.
    const isDone = (o) =>
      stages.length ? !!resolveStage(o, stages)?.isTerminal : o.status === 'completed';
    return {
      open: data.orders.filter((o) => !isDone(o)).length,
      completed: data.orders.filter((o) => isDone(o)).length,
      outstanding,
      mtd,
    };
  }, [data]);

  const stuckOrders = useMemo(() => {
    if (!data) return [];
    const stages = data.stages || [];
    return data.orders
      .filter((o) => isStuck(o, stages, data.stuckDays))
      .map((o) => ({ order: o, days: daysInCurrentStage(o, stages), stage: resolveStage(o, stages) }))
      .sort((a, b) => b.days - a.days);
  }, [data]);

  // Dashboard disabled → Work list is the home screen.
  if (features.ready && !features.dashboard) return <Navigate to="/work" replace />;
  if (!data) return null;
  const { orders, accounts, bills, ordersById, stages } = data;
  const useStages = features.stages && stages.length > 0;

  return (
    <>
      <h1 style={{ marginTop: 4 }}>Dashboard</h1>
      <BackupReminder hasData={orders.length > 0} />

      <div className="stat-grid">
        <div className="stat">
          <div className="stat__label">Open jobs</div>
          <div className="stat__value">{stats.open}</div>
        </div>
        {features.billing ? (
          <div className="stat">
            <div className="stat__label">Outstanding</div>
            <div className="stat__value" style={{ color: stats.outstanding > 0 ? 'var(--badge-open-fg)' : 'inherit' }}>
              {money(stats.outstanding)}
            </div>
          </div>
        ) : (
          <div className="stat">
            <div className="stat__label">Completed</div>
            <div className="stat__value">{stats.completed}</div>
          </div>
        )}
        {features.billing && (
          <div className="stat stat--wide">
            <div className="stat__label">Billed this month</div>
            <div className="stat__value">{money(stats.mtd)}</div>
          </div>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 4 }}>
        <button className="btn" onClick={() => navigate('/work-orders/new')}>
          <Icon name="plus" /> New work order
        </button>
        {features.billing && stats.outstanding > 0 && (
          <button className="btn btn--ghost" onClick={() => navigate('/work', { state: { filter: 'unpaid' } })}>
            <Icon name="banknote" /> Unpaid
          </button>
        )}
      </div>

      {features.billing && stats.outstanding > 0 && (
        <>
          <div className="section-title">Who owes me money</div>
          <div className="list">
            {unpaidBills(bills, ordersById, accounts).map((u) => (
              <Link key={u.workOrderId} className="list-item" to={`/work-orders/${u.workOrderId}`}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <p className="list-item__title">{u.name}</p>
                  <strong>{money(u.total)}</strong>
                </div>
                <p className="list-item__sub">Unpaid · {u.ageDays}d old</p>
              </Link>
            ))}
          </div>
        </>
      )}

      {useStages && stuckOrders.length > 0 && (
        <>
          <div className="section-title">Stuck jobs ({stuckOrders.length})</div>
          <div className="list">
            {stuckOrders.map(({ order, days, stage }) => (
              <Link key={order.id} className="list-item" to={`/work-orders/${order.id}`}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <p className="list-item__title">{accounts[order.accountId]?.name || 'Unknown account'}</p>
                  {stage && <span className={`badge badge--${stageColorClass(stage)}`}>{stage.name}</span>}
                </div>
                <p className="list-item__sub">{days}d in stage</p>
              </Link>
            ))}
          </div>
        </>
      )}

      {features.billing && bills.length > 0 && (
        <>
          <div className="section-title">Recent bills</div>
          <div className="list">
            {bills.slice(0, 3).map((b) => {
              const acct = accounts[ordersById[b.workOrderId]?.accountId];
              const paid = b.paymentStatus === 'paid';
              return (
                <Link key={b.id} className="list-item" to={`/work-orders/${b.workOrderId}`}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <p className="list-item__title">{acct?.name || 'Unknown'}</p>
                    <span className={`badge badge--${paid ? 'paid' : 'unpaid'}`}>{paid ? 'paid' : 'unpaid'}</span>
                  </div>
                  <p className="list-item__sub">{money(b.total || 0)} · {fmtDate(b.billDate || b.createdAt)}</p>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <div className="section-title">Recent work orders</div>
      {orders.length === 0 ? (
        <div className="empty">
          <span className="ico"><Icon name="wrench" size={40} /></span>
          No work orders yet.
          <br />
          Tap ＋ New work order to log your first job.
        </div>
      ) : (
        <>
          <div className="list">
            {orders.slice(0, 5).map((o) => (
              <Link key={o.id} className="list-item" to={`/work-orders/${o.id}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <p className="list-item__title">{accounts[o.accountId]?.name || 'Unknown account'}</p>
                  {(() => {
                    const stage = useStages ? resolveStage(o, stages) : null;
                    return stage ? (
                      <span className={`badge badge--${stageColorClass(stage)}`}>{stage.name}</span>
                    ) : (
                      <span className={`badge badge--${o.status}`}>{o.status}</span>
                    );
                  })()}
                </div>
                <p className="list-item__sub">
                  {o.issue ? o.issue.slice(0, 80) : 'No issue noted'} · {fmtDate(o.serviceDate)}
                </p>
              </Link>
            ))}
          </div>
          {orders.length > 5 && (
            <Link className="btn btn--ghost" to="/work" style={{ marginTop: 10 }}>
              View all work orders <Icon name="arrow-right" />
            </Link>
          )}
        </>
      )}
    </>
  );
}
