import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PocketBase from 'pocketbase';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/pixelify-sans/latin-700.css';
import './style.css';
type Link = { label: string; url: string };
type Profile = {
  id: string;
  name: string;
  role: string;
  photo: string;
  links: Link[];
  position: number;
};
type Setup = {
  authReady: boolean;
  publishReady: boolean;
  pocketbaseReady: boolean;
  missing: string[];
};
type Publication = {
  head: string;
  last?: { revision: string; commit?: string; submission: string };
  deployment: { status: string; live: boolean; runURL?: string };
};
const pb = new PocketBase(window.location.origin);
const empty = (): Omit<Profile, 'id'> => ({
  name: '',
  role: '',
  photo: '',
  links: [],
  position: 0,
});
async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const result = await fetch('/api/editor/' + path, {
    method,
    headers: {
      Authorization: pb.authStore.token,
      ...(body instanceof File
        ? { 'Content-Type': body.type }
        : { 'Content-Type': 'application/json' }),
    },
    body:
      body === undefined
        ? undefined
        : body instanceof File
          ? body
          : JSON.stringify(body),
  });
  const data = await result.json();
  if (!result.ok) {
    if ([401, 403].includes(result.status)) pb.authStore.clear();
    throw new Error(data.message || 'Request failed.');
  }
  return data;
}
function Portrait({ photo, name }: { photo: string; name: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    let objectURL = '';
    setSrc('');
    if (photo)
      fetch('/api/editor/portrait/' + photo, {
        headers: { Authorization: pb.authStore.token },
      })
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.blob();
        })
        .then((blob) => {
          objectURL = URL.createObjectURL(blob);
          if (alive) setSrc(objectURL);
          else URL.revokeObjectURL(objectURL);
        })
        .catch(() => {});
    return () => {
      alive = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [photo]);
  return src ? (
    <img className="portrait" src={src} alt={`${name}'s portrait`} />
  ) : (
    <div className="portrait placeholder" aria-label="No portrait">
      {name.slice(0, 1).toUpperCase() || '+'}
    </div>
  );
}
function App() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [signedIn, setSignedIn] = useState(pb.authStore.isValid);
  const [records, setRecords] = useState<Profile[]>([]);
  const [version, setVersion] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState(empty);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  async function load() {
    const result = await api<{ records: Profile[]; version: string }>(
      'profiles',
    );
    setRecords(result.records);
    setVersion(result.version);
    try {
      setPublication(await api<Publication>('publication'));
    } catch {
      setPublication(null);
    }
  }
  async function run(action: () => Promise<void>) {
    setPending(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Operation failed.');
    } finally {
      setPending(false);
    }
  }
  useEffect(
    () => pb.authStore.onChange(() => setSignedIn(pb.authStore.isValid)),
    [],
  );
  useEffect(() => {
    api<Setup>('setup')
      .then(setSetup)
      .catch(() =>
        setMessage(
          'Editor server is unavailable. Start the local server to inspect setup.',
        ),
      );
    const callback = new URL(window.location.href);
    if (callback.pathname === '/oauth/callback') {
      void run(async () => {
        const saved = JSON.parse(
          sessionStorage.getItem('gcom-oauth') || 'null',
        );
        sessionStorage.removeItem('gcom-oauth');
        const code = callback.searchParams.get('code');
        if (
          !saved ||
          !code ||
          callback.searchParams.get('state') !== saved.state ||
          Date.now() - saved.createdAt > 600000
        )
          throw new Error(
            'Google sign-in expired or was cancelled. Try again.',
          );
        await pb
          .collection('committee_users')
          .authWithOAuth2Code(
            'google',
            code,
            saved.codeVerifier,
            window.location.origin + '/oauth/callback',
          );
        window.history.replaceState({}, '', '/');
      });
    }
  }, []);
  useEffect(() => {
    if (signedIn) void run(load);
  }, [signedIn]);
  async function signIn() {
    const methods = await pb.collection('committee_users').listAuthMethods();
    const google = methods.oauth2.providers.find((p) => p.name === 'google');
    if (!google) throw new Error('Google sign-in requires server setup.');
    sessionStorage.setItem(
      'gcom-oauth',
      JSON.stringify({ ...google, createdAt: Date.now() }),
    );
    window.location.assign(
      google.authURL +
        encodeURIComponent(window.location.origin + '/oauth/callback'),
    );
  }
  function choose(record: Profile) {
    setSelected(record.id);
    setDraft({ ...record, links: record.links || [] });
    setConfirmPublish(false);
  }
  async function save() {
    const p = await api<Profile>(
      selected ? 'profiles/' + selected : 'profiles',
      selected ? 'PATCH' : 'POST',
      selected
        ? draft
        : {
            ...draft,
            position: records.length
              ? Math.max(...records.map((record) => record.position)) + 1
              : 0,
          },
    );
    await load();
    choose(p);
    setMessage('Profile saved to the draft roster.');
  }
  async function move(index: number, direction: number) {
    const ordered = [...records];
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await api('order', 'POST', {
        ids: ordered.map((record) => record.id),
        expectedDraft: version,
      });
    } finally {
      await load();
    }
  }
  return (
    <div className="shell">
      <header>
        <a className="brand" href="/" aria-label="GCOM editor home">
          <span className="brand-mark">G</span>
          <span>
            GCOM<span className="brand-sub">COMMITTEE CONSOLE</span>
          </span>
        </a>
        <div className="header-actions">
          <span className="draft-chip">DRAFT WORKSPACE</span>
          {signedIn && (
            <button
              className="quiet"
              onClick={() => {
                pb.authStore.clear();
                setRecords([]);
                setSelected(null);
                setDraft(empty());
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">PEOPLE BEHIND THE PLAY</p>
            <h1>
              Committee roster<span>.</span>
            </h1>
            <p className="muted">
              Update your people. Preview the lineup. Publish when it is ready.
            </p>
          </div>
          {signedIn && (
            <button className="secondary" onClick={() => setPreview(!preview)}>
              {preview ? 'Back to editor' : 'Preview roster'}
            </button>
          )}
        </div>
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        {!signedIn ? (
          <section className="setup-panel">
            <div className="setup-symbol" aria-hidden="true">
              ↗
            </div>
            <p className="eyebrow">COMMITTEE ACCESS</p>
            <h2>
              {setup?.authReady
                ? 'Your roster starts here.'
                : 'A little setup before sign-in.'}
            </h2>
            <p className="muted">
              Sign in with your verified Google account. Access is limited to
              the committee email allowlist.
            </p>
            <button
              disabled={!setup?.authReady || pending}
              onClick={() => void run(signIn)}
            >
              Continue with Google
            </button>
            {!setup?.authReady && (
              <div className="setup-detail">
                <strong>Setup required</strong>
                <p>
                  {setup?.pocketbaseReady
                    ? 'PocketBase is running.'
                    : 'PocketBase is not connected.'}{' '}
                  Google credentials and the committee allowlist must be
                  configured by the operator.
                </p>
                {setup?.missing.length ? (
                  <ul>
                    {setup.missing.map((item) => (
                      <li key={item}>
                        {item.replaceAll('_', ' ').toLowerCase()}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p>No profiles are shown before sign-in.</p>
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="workspace-bar">
              <span>
                <i className="status-dot" />
                Private draft{' '}
                <span className="muted">/ {records.length} members</span>
              </span>
              <button
                className="quiet"
                disabled={pending}
                onClick={() => void run(load)}
              >
                Reload draft
              </button>
            </div>
            {preview ? (
              <section className="roster-preview">
                <p className="eyebrow">ROSTER PREVIEW · UNPUBLISHED</p>
                <h2>Meet the committee.</h2>
                <div className="preview-grid">
                  {records.map((record) => (
                    <article key={record.id}>
                      <Portrait photo={record.photo} name={record.name} />
                      <h3>{record.name}</h3>
                      <p>{record.role}</p>
                      <div className="socials">
                        {record.links?.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {link.label} ↗
                          </a>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                {!records.length && (
                  <p className="muted">
                    Your committee will appear here after you add profiles.
                  </p>
                )}
              </section>
            ) : (
              <div className="editor-grid">
                <section className="roster-list">
                  <div className="section-heading">
                    <h2>The lineup</h2>
                    <button
                      className="quiet"
                      disabled={pending}
                      onClick={() => {
                        setSelected(null);
                        setDraft({ ...empty(), position: records.length });
                        setConfirmPublish(false);
                      }}
                    >
                      + Add profile
                    </button>
                  </div>
                  {records.length ? (
                    records.map((record, index) => (
                      <div
                        className={
                          'member-row ' +
                          (selected === record.id ? 'selected' : '')
                        }
                        key={record.id}
                      >
                        <span className="order">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <button
                          className="member-select"
                          disabled={pending}
                          onClick={() => choose(record)}
                        >
                          <Portrait photo={record.photo} name={record.name} />
                          <span>
                            <strong>{record.name}</strong>
                            <small>{record.role}</small>
                          </span>
                        </button>
                        <div className="order-buttons">
                          <button
                            className="quiet"
                            aria-label={`Move ${record.name} up`}
                            disabled={pending || index === 0}
                            onClick={() => void run(() => move(index, -1))}
                          >
                            ↑
                          </button>
                          <button
                            className="quiet"
                            aria-label={`Move ${record.name} down`}
                            disabled={pending || index === records.length - 1}
                            onClick={() => void run(() => move(index, 1))}
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <span aria-hidden="true">+</span>
                      <h3>A new lineup.</h3>
                      <p>
                        Add your first committee profile. Nothing reaches the
                        public site until you publish.
                      </p>
                    </div>
                  )}
                </section>
                <section className="profile-panel">
                  <div className="section-heading">
                    <h2>{selected ? 'Edit profile' : 'New profile'}</h2>
                    <span className="muted">PRIVATE DRAFT</span>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(save);
                    }}
                  >
                    <fieldset disabled={pending}>
                      <div className="portrait-field">
                        <Portrait photo={draft.photo} name={draft.name} />
                        <div>
                          <label className="upload">
                            Choose portrait
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file)
                                  void run(async () => {
                                    const upload = await api<{
                                      filename: string;
                                    }>('portrait', 'POST', file);
                                    setDraft((d) => ({
                                      ...d,
                                      photo: upload.filename,
                                    }));
                                  });
                                e.target.value = '';
                              }}
                            />
                          </label>
                          <p className="help">
                            JPEG, PNG or WebP · up to 12 MB
                          </p>
                          {draft.photo && (
                            <button
                              className="quiet"
                              type="button"
                              onClick={() => setDraft({ ...draft, photo: '' })}
                            >
                              Remove portrait
                            </button>
                          )}
                        </div>
                      </div>
                      <label>
                        Name
                        <input
                          required
                          maxLength={80}
                          value={draft.name}
                          onChange={(e) =>
                            setDraft({ ...draft, name: e.target.value })
                          }
                          autoComplete="name"
                        />
                      </label>
                      <label>
                        Committee role
                        <input
                          required
                          maxLength={100}
                          value={draft.role}
                          onChange={(e) =>
                            setDraft({ ...draft, role: e.target.value })
                          }
                        />
                      </label>
                      <div className="section-heading">
                        <label>
                          Social links <span className="muted">optional</span>
                        </label>
                        <button
                          className="quiet"
                          type="button"
                          disabled={draft.links.length >= 5}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              links: [...draft.links, { label: '', url: '' }],
                            })
                          }
                        >
                          + Add link
                        </button>
                      </div>
                      {draft.links.map((link, index) => (
                        <div className="link-fields" key={index}>
                          <label>
                            Label
                            <input
                              required
                              maxLength={40}
                              value={link.label}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  links: draft.links.map((l, i) =>
                                    i === index
                                      ? { ...l, label: e.target.value }
                                      : l,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            HTTPS URL
                            <input
                              required
                              type="url"
                              pattern="https://.*"
                              maxLength={500}
                              value={link.url}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  links: draft.links.map((l, i) =>
                                    i === index
                                      ? { ...l, url: e.target.value }
                                      : l,
                                  ),
                                })
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="quiet"
                            aria-label={`Remove link ${index + 1}`}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                links: draft.links.filter(
                                  (_, i) => i !== index,
                                ),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <div className="form-footer">
                        <button type="submit">
                          {pending ? 'Working…' : 'Save to draft'}
                        </button>
                        {selected && (
                          <button
                            type="button"
                            className="danger quiet"
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Delete this draft profile? The public roster stays as published.',
                                )
                              )
                                void run(async () => {
                                  await api('profiles/' + selected, 'DELETE');
                                  setSelected(null);
                                  setDraft(empty());
                                  await load();
                                });
                            }}
                          >
                            Delete profile
                          </button>
                        )}
                      </div>
                    </fieldset>
                  </form>
                </section>
              </div>
            )}
            <section className="publish-panel">
              <div>
                <p className="eyebrow">READY FOR THE NEXT ROUND?</p>
                <h2>Publish this lineup.</h2>
                <p className="muted">
                  Creates a validated roster revision and one repository commit.
                  Deployment is tracked separately.
                </p>
                {publication?.last && (
                  <p className="help">
                    Last submission: {publication.last.submission}
                    {publication.last.commit
                      ? ' · ' + publication.last.commit.slice(0, 7)
                      : ''}
                    . Deployment:{' '}
                    {publication.deployment.status.replaceAll('_', ' ')}.
                    {publication.deployment.runURL && (
                      <>
                        {' '}
                        <a
                          href={publication.deployment.runURL}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View workflow ↗
                        </a>
                      </>
                    )}
                  </p>
                )}
                {!publication && (
                  <p className="help">
                    GitHub publishing requires operator setup before a commit
                    can be submitted.
                  </p>
                )}
              </div>
              <div>
                {confirmPublish ? (
                  <div className="publish-confirm">
                    <p>Publish {records.length} saved profiles?</p>
                    <button
                      disabled={pending}
                      onClick={() =>
                        void run(async () => {
                          const result = await api<{ commit: string }>(
                            'publish',
                            'POST',
                            {
                              expectedDraft: version,
                              expectedHead: publication?.head,
                            },
                          );
                          setConfirmPublish(false);
                          await load();
                          setMessage(
                            `Commit submitted: ${result.commit.slice(0, 7)}. Deployment remains unverified.`,
                          );
                        })
                      }
                    >
                      Confirm publication
                    </button>
                    <button
                      className="quiet"
                      onClick={() => setConfirmPublish(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    disabled={
                      pending ||
                      !setup?.publishReady ||
                      !publication?.head ||
                      ['pending', 'unknown'].includes(
                        publication?.last?.submission || '',
                      )
                    }
                    onClick={() => setConfirmPublish(true)}
                  >
                    Publish saved draft ↗
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </main>
      <footer>
        <span>GCOM / COMMITTEE EDITOR</span>
        <span>Drafts stay private until published.</span>
      </footer>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
