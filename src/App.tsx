import { useApp, useMyDocuments } from './app/AppContext';
import { navigate, useHashRoute } from './app/useHashRoute';
import { DocumentList } from './components/DocumentList';
import { DocumentScreen } from './components/DocumentScreen';
import { nextActionFor } from './domain/rules';
import { USERS } from './domain/users';

export default function App() {
  const route = useHashRoute();
  const { currentUser, switchUser } = useApp();
  const pending = useMyDocuments().filter((d) => nextActionFor(d, currentUser)).length;

  return (
    <>
      <header className="app-header">
        <button className="brand" onClick={() => navigate({ name: 'list' })}>
          ✍ MiniSign
        </button>
        {pending > 0 && <span className="pending">{pending} need your action</span>}
        <label className="user-switcher">
          Acting as
          <select value={currentUser.id} onChange={(e) => switchUser(e.target.value)}>
            {USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.company}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main>
        {route.name === 'doc' ? <DocumentScreen id={route.id} /> : <DocumentList />}
      </main>
    </>
  );
}
