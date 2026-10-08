import {
  getListChildrenQueryKey,
  useCreateInvite,
  useListMembers,
  useRemoveMember,
  useRevokeInvite,
  useTransferOwnership,
  type CreatedInviteDto,
} from '@appandam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AlertBox } from '../../components/AlertBox';
import { Button } from '../../components/Button';
import { LoadError } from '../../components/LoadError';
import { messageFor } from '../../lib/errors';
import { vi } from '../../strings/vi';
import { useActiveChild } from '../child/guards';
import { shortDate, todayInVietnam } from '../meals/format';
import styles from './MembersCard.module.css';

const t = vi.members;
const day = (at: string) => shortDate(todayInVietnam(new Date(at)));

type Pending = { kind: 'remove' | 'owner'; userId: string; name: string } | { kind: 'leave' };

function InviteLink({ invite, childName }: { invite: CreatedInviteDto; childName: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';
  return (
    <div className={styles.link}>
      <strong>{t.linkReady}</strong>
      <input
        aria-label={t.linkLabel}
        className={styles.url}
        readOnly
        value={invite.url}
        onFocus={(e) => e.target.select()}
      />
      <AlertBox tone="warn">{t.linkWarning}</AlertBox>
      <div className={styles.actions}>
        {canShare && (
          <Button
            onClick={() =>
              navigator
                .share({ title: t.shareText(childName), url: invite.url })
                .catch(() => undefined)
            }
          >
            {t.share}
          </Button>
        )}
        <Button
          variant={canShare ? 'secondary' : 'primary'}
          onClick={() =>
            navigator.clipboard?.writeText(invite.url).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? t.copied : t.copy}
        </Button>
      </div>
    </div>
  );
}

/** G13: who cares for the child; the owner invites, removes and hands over (UC-20, UC-22). */
export function MembersCard() {
  const child = useActiveChild();
  const owner = child.role === 'owner';
  const list = useListMembers(child.id);
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const remove = useRemoveMember();
  const transfer = useTransferOwnership();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);
  const [invite, setInvite] = useState<CreatedInviteDto | null>(null);
  const error = create.error ?? revoke.error ?? remove.error ?? transfer.error;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [`/api/v1/children/${child.id}/members`] }),
      queryClient.invalidateQueries({ queryKey: getListChildrenQueryKey() }),
    ]);

  async function confirm() {
    if (!pending) return;
    const me = list.data!.members.find((m) => m.isMe)!;
    const done = await (
      pending.kind === 'owner'
        ? transfer.mutateAsync({ childId: child.id, data: { userId: pending.userId } })
        : remove.mutateAsync({
            childId: child.id,
            userId: pending.kind === 'leave' ? me.userId : pending.userId,
          })
    ).then(
      () => true,
      () => false,
    );
    if (!done) return;
    setPending(null);
    await refresh();
  }

  async function newInvite() {
    const created = await create.mutateAsync({ childId: child.id }).catch(() => null);
    if (!created) return;
    setInvite(created);
    await refresh();
  }

  const question =
    pending?.kind === 'remove'
      ? t.removeConfirm(pending.name)
      : pending?.kind === 'owner'
        ? t.makeOwnerConfirm(pending.name)
        : pending
          ? t.leaveConfirm(child.name)
          : null;

  return (
    <section aria-label={t.title} className={styles.card}>
      <h2 className={styles.title}>{t.title}</h2>
      {list.isPending ? (
        <p role="status" className={styles.muted}>
          {vi.common.loading}
        </p>
      ) : list.isError ? (
        <LoadError error={list.error} retry={() => list.refetch()} />
      ) : (
        <>
          <ul className={styles.list}>
            {list.data.members.map((m) => (
              <li key={m.userId} className={styles.member}>
                <div className={styles.text}>
                  <span className={styles.name}>
                    {m.displayName}
                    {m.isMe && <span className={styles.me}> · {t.me}</span>}
                  </span>
                  <span className={styles.muted}>
                    {t.roles[m.role as keyof typeof t.roles]} · {t.since(day(m.joinedAt))}
                  </span>
                </div>
                {owner && !m.isMe && (
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      aria-label={t.makeOwnerLabel(m.displayName)}
                      onClick={() =>
                        setPending({ kind: 'owner', userId: m.userId, name: m.displayName })
                      }
                    >
                      {t.makeOwner}
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={t.removeLabel(m.displayName)}
                      onClick={() =>
                        setPending({ kind: 'remove', userId: m.userId, name: m.displayName })
                      }
                    >
                      {t.remove}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {owner && list.data.pendingInvites.length > 0 && (
            <div className={styles.pending}>
              <h3 className={styles.subtitle}>{t.pending}</h3>
              <ul className={styles.list}>
                {list.data.pendingInvites.map((i) => (
                  <li key={i.id} className={styles.member}>
                    <span className={styles.muted}>{t.expires(day(i.expiresAt))}</span>
                    <Button
                      variant="ghost"
                      aria-label={t.revokeLabel(day(i.expiresAt))}
                      loading={revoke.isPending}
                      onClick={async () => {
                        const done = await revoke
                          .mutateAsync({ childId: child.id, inviteId: i.id })
                          .then(
                            () => true,
                            () => false,
                          );
                        if (done) await refresh();
                      }}
                    >
                      {t.revoke}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {question && (
            <div className={styles.confirm}>
              <AlertBox tone="warn">{question}</AlertBox>
              <div className={styles.actions}>
                <Button
                  variant={pending!.kind === 'owner' ? 'primary' : 'danger'}
                  loading={remove.isPending || transfer.isPending}
                  onClick={confirm}
                >
                  {t.confirm}
                </Button>
                <Button variant="secondary" onClick={() => setPending(null)}>
                  {t.cancel}
                </Button>
              </div>
            </div>
          )}
          {error != null && <AlertBox tone="danger">{messageFor(error)}</AlertBox>}

          {owner ? (
            <>
              <p className={styles.muted}>{t.inviteHint}</p>
              {invite && <InviteLink invite={invite} childName={child.name} />}
              <Button variant="secondary" onClick={newInvite} loading={create.isPending}>
                {t.invite}
              </Button>
            </>
          ) : (
            <>
              <p className={styles.muted}>{t.caregiverNote}</p>
              {!pending && (
                <Button variant="ghost" onClick={() => setPending({ kind: 'leave' })}>
                  {t.leave}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
