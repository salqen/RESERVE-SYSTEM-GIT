export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { getMe, UnauthorizedError } from '@/lib/admin-api';
import AdminShell from '../shell';
import { ROADMAP, STATUS_LABEL, type ItemStatus } from './data';

const BADGE: Record<ItemStatus, string> = {
  done: 'confirmed',
  waiting: 'hold',
  todo: 'cancelled',
};

export default async function AdminRoadmapPage() {
  let me;
  try {
    me = await getMe();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect('/admin/login');
    throw err;
  }

  const all = ROADMAP.flatMap((p) => p.items);
  const counts = {
    done: all.filter((i) => i.status === 'done').length,
    waiting: all.filter((i) => i.status === 'waiting').length,
    todo: all.filter((i) => i.status === 'todo').length,
  };
  const progress = Math.round((counts.done / all.length) * 100);

  return (
    <AdminShell
      user={me.user}
      title="Stav projektu"
      subtitle={`${counts.done} z ${all.length} oblastí hotových · ${progress} %`}
    >
      <div className="cards">
        <div className="card metric">
          <span className="metric-label">Hotové</span>
          <span className="metric-value accent">{counts.done}</span>
          <span className="metric-note">funguje v systéme</span>
        </div>
        <div className="card metric">
          <span className="metric-label">Čaká na konfiguráciu</span>
          <span className="metric-value">{counts.waiting}</span>
          <span className="metric-note">kód hotový, chýbajú prístupy</span>
        </div>
        <div className="card metric">
          <span className="metric-label">Zostáva</span>
          <span className="metric-value">{counts.todo}</span>
          <span className="metric-note">ešte sa nezačalo</span>
        </div>
      </div>

      {ROADMAP.map((phase) => (
        <section className="section" key={phase.name}>
          <h2 className="section-title">{phase.name}</h2>
          <p className="sub" style={{ marginTop: -6, marginBottom: 12 }}>{phase.summary}</p>

          {phase.items.map((item) => (
            <div className="item" key={item.title}>
              <div className="item-head">
                <strong>{item.title}</strong>
                <span className={`badge ${BADGE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
              </div>
              <p className="sub" style={{ marginTop: 6, maxWidth: 720 }}>{item.detail}</p>
              {item.blockedBy && (
                <p
                  className="sub"
                  style={{ marginTop: 6, maxWidth: 720, color: 'var(--warn)' }}
                >
                  Čaká na: {item.blockedBy}
                </p>
              )}
            </div>
          ))}
        </section>
      ))}

      <p className="sub" style={{ marginTop: 30 }}>
        Podrobný technický záznam všetkých zmien je v súbore EDIT-LOG.md v repozitári projektu.
      </p>
    </AdminShell>
  );
}
