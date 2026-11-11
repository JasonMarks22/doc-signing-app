import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { USERS, findUser } from '../domain/users';
import { canView, visibleTo } from '../domain/rules';
import type { SigningDocument, User } from '../domain/types';
import type { Services } from '../services/container';
import { DomainError } from '../services/documentService';

/**
 * React's view of the app. Components never import the repository or localStorage; they get
 * the services from context and read data through these hooks. There is exactly ONE source
 * of truth for documents (the repository) – components never copy documents into useState.
 */

interface AppContextValue {
  services: Services;
  currentUser: User;
  switchUser: (id: string) => void;
}

const Ctx = createContext<AppContextValue | null>(null);
const SESSION_KEY = 'docsign:currentUser';

/**
 * The "logged in" user is per TAB (sessionStorage), not shared like the documents
 * (localStorage), so two tabs can act as two people and keep their identity on refresh.
 */
function readSessionUser(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSessionUser(id: string) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    // Storage unavailable (e.g. privacy mode): the choice just won't survive a refresh.
  }
}

export function AppProvider({ services, children }: { services: Services; children: ReactNode }) {
  const [userId, setUserId] = useState(() => readSessionUser() ?? USERS[0].id);
  const switchUser = useCallback((id: string) => {
    writeSessionUser(id);
    setUserId(id);
  }, []);
  const currentUser = findUser(userId) ?? USERS[0];
  const value = useMemo(
    () => ({ services, currentUser, switchUser }),
    [services, currentUser, switchUser],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

/** Re-renders whenever the repository changes (this tab or another tab). */
function useAllDocuments(): SigningDocument[] {
  const { repo } = useApp().services;
  return useSyncExternalStore(
    (cb) => repo.subscribe(cb),
    () => repo.list(),
  );
}

/** Documents the current user sent or received. */
export function useMyDocuments(): SigningDocument[] {
  const all = useAllDocuments();
  const { currentUser } = useApp();
  return useMemo(() => visibleTo(all, currentUser), [all, currentUser]);
}

export function useDocument(id: string): SigningDocument | undefined {
  const all = useAllDocuments();
  const { currentUser } = useApp();
  return useMemo(
    () => all.find((d) => d.id === id && canView(d, currentUser)),
    [all, id, currentUser],
  );
}

export function useAuditEntries(documentId: string) {
  const { audit } = useApp().services;
  return useSyncExternalStore(
    (cb) => audit.subscribe(cb),
    () => audit.entriesFor(documentId),
  );
}

/**
 * Wraps service calls: business-rule violations (DomainError) become a message to show,
 * anything else is a real bug and is re-thrown.
 */
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const run = useCallback((fn: () => void): boolean => {
    try {
      fn();
      setError(null);
      return true;
    } catch (err) {
      if (err instanceof DomainError) {
        setError(err.message);
        return false;
      }
      throw err;
    }
  }, []);
  return { error, setError, run };
}
