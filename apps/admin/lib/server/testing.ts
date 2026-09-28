/**
 * پیاده‌سازی حافظه‌ای `AdminStore`، فقط برای تست؛ همان قرارداد نسخهٔ پستگرس (`packages/db/src/admin.ts`)،
 * که درستی‌اش (اتمی بودن، قفل، محافظ‌ها) در تست یکپارچگی `packages/db` سنجیده می‌شود.
 */

import {
  ADMIN_ROLES,
  PARTNER_ROLE,
  isAdminRole,
  type AdminEventInput,
  type AdminEventRow,
  type AdminInviteRow,
  type AdminPartnerChoice,
  type AdminStore,
  type AdminUserRow,
} from '@jozveyar/db';

interface SessionRow {
  id: string;
  tokenHash: string;
  adminUserId: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

interface AttemptRow {
  id: number;
  at: Date;
  username: string;
  adminUserId: string | null;
  ipHash: string;
  ok: boolean;
}

export function memoryAdminStore(): AdminStore & {
  users: Map<string, AdminUserRow>;
  roles: Map<string, string[]>;
  /** چاپخانه‌ها (برش ۵٫۳)، و چاپخانهٔ هر کاربر چاپخانه. */
  partners: Map<string, AdminPartnerChoice & { active: boolean }>;
  partnerOf: Map<string, string>;
  invites: AdminInviteRow[];
  sessions: SessionRow[];
  attempts: AttemptRow[];
  events: AdminEventRow[];
} {
  const users = new Map<string, AdminUserRow>();
  const roles = new Map<string, string[]>();
  const partners = new Map<string, AdminPartnerChoice & { active: boolean }>();
  const partnerOf = new Map<string, string>();
  const invites: AdminInviteRow[] = [];
  const sessions: SessionRow[] = [];
  const attempts: AttemptRow[] = [];
  const events: AdminEventRow[] = [];
  let sessionSeq = 0;

  const addEvent = (event: AdminEventInput) => {
    events.push({
      id: events.length + 1,
      at: event.at,
      adminUserId: event.adminUserId,
      action: event.action,
      targetType: event.targetType ?? null,
      targetId: event.targetId ?? null,
      ipHash: event.ipHash ?? null,
      detail: (event.detail ?? null) as AdminEventRow['detail'],
    });
  };

  const permissionsOf = (userId: string) =>
    [...new Set((roles.get(userId) ?? []).filter(isAdminRole).flatMap((role) => ADMIN_ROLES[role].permissions))].sort();

  const revokeOpen = (userId: string, at: Date) => {
    let n = 0;
    for (const invite of invites) {
      if (invite.adminUserId === userId && !invite.usedAt && !invite.revokedAt) {
        invite.revokedAt = at;
        n += 1;
      }
    }
    return n;
  };

  const revokeSessionsOf = (userId: string, at: Date) => {
    for (const session of sessions) if (session.adminUserId === userId && !session.revokedAt) session.revokedAt = at;
  };

  const activeOwners = () =>
    [...users.values()].filter((u) => !u.disabledAt && (roles.get(u.id) ?? []).includes('owner')).map((u) => u.id);

  const byUsername = (username: string) => [...users.values()].find((u) => u.username === username) ?? null;

  const partnerRef = (userId: string) => {
    const partner = partners.get(partnerOf.get(userId) ?? '');
    return partner ? { id: partner.id, name: partner.name } : null;
  };

  /** نقش تازه، مثل ردیف `admin_user_roles`: نقش چاپخانه با چاپخانه‌اش، بقیه بی آن. */
  const setRole = (userId: string, role: string, partnerId: string | null) => {
    roles.set(userId, [role]);
    if (role === PARTNER_ROLE && partnerId) partnerOf.set(userId, partnerId);
    else partnerOf.delete(userId);
  };

  return {
    users,
    roles,
    partners,
    partnerOf,
    invites,
    sessions,
    attempts,
    events,

    async findUserByUsername(username) {
      return byUsername(username);
    },

    async findUser(id) {
      return users.get(id) ?? null;
    },

    async rolesOf(userId) {
      return [...(roles.get(userId) ?? [])].sort();
    },

    async countAttempts(ipHash, since) {
      return attempts.filter((a) => a.ipHash === ipHash && a.at.getTime() > since.getTime()).length;
    },

    async recordAttempt(attempt) {
      const id = attempts.length + 1;
      attempts.push({ ...attempt, id, ok: false });
      return id;
    },

    async claimAttempt(userId, maxFailures, at, lockUntil) {
      const user = users.get(userId);
      if (!user) return { allowed: false, lockedUntil: null };
      if (user.lockedUntil && user.lockedUntil.getTime() > at.getTime()) return { allowed: false, lockedUntil: user.lockedUntil };
      const reached = user.failedAttempts + 1 >= maxFailures;
      user.failedAttempts = reached ? 0 : user.failedAttempts + 1;
      user.lockedUntil = reached ? lockUntil : null;
      return { allowed: true, lockedUntil: user.lockedUntil };
    },

    async clearFailures(userId) {
      const user = users.get(userId);
      if (user) Object.assign(user, { failedAttempts: 0, lockedUntil: null });
    },

    async claimTotpStep(userId, step) {
      const user = users.get(userId);
      if (!user || (user.totpLastStep !== null && user.totpLastStep >= step)) return false;
      user.totpLastStep = step;
      return true;
    },

    async startSession(input) {
      const user = users.get(input.userId)!;
      Object.assign(user, { failedAttempts: 0, lockedUntil: null, lastLoginAt: input.at });
      sessions.push({
        id: `s${++sessionSeq}`,
        tokenHash: input.tokenHash,
        adminUserId: input.userId,
        createdAt: input.at,
        expiresAt: input.expiresAt,
        lastSeenAt: input.at,
        revokedAt: null,
      });
      const attempt = attempts.find((a) => a.id === input.attemptId);
      if (attempt) Object.assign(attempt, { ok: true, adminUserId: input.userId });
      addEvent(input.event);
    },

    async findSession(tokenHash) {
      const session = sessions.find((s) => s.tokenHash === tokenHash);
      if (!session) return null;
      const user = users.get(session.adminUserId)!;
      return {
        sessionId: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastSeenAt: session.lastSeenAt,
        revokedAt: session.revokedAt,
        user: { ...user },
        roles: [...(roles.get(user.id) ?? [])].sort(),
        permissions: permissionsOf(user.id),
        partner: partnerRef(user.id),
      };
    },

    async touchSession(sessionId, at) {
      const session = sessions.find((s) => s.id === sessionId);
      if (session && session.lastSeenAt.getTime() < at.getTime()) session.lastSeenAt = at;
    },

    async revokeSession(tokenHash, at) {
      const session = sessions.find((s) => s.tokenHash === tokenHash && !s.revokedAt);
      if (!session) return null;
      session.revokedAt = at;
      return { adminUserId: session.adminUserId };
    },

    async revokeUserSessions(userId, at) {
      revokeSessionsOf(userId, at);
    },

    async createInvite(input) {
      let partner: AdminPartnerChoice | null = null;
      if (input.role === PARTNER_ROLE) {
        if (!input.partnerId) return { ok: false, reason: 'partner_required' };
        const active = partners.get(input.partnerId);
        if (!active?.active) return { ok: false, reason: 'partner_inactive' };
        partner = active;
      }
      const existing = byUsername(input.username);
      let userId: string;
      if (existing) {
        if (!input.allowExisting) return { ok: false, reason: 'username_taken' };
        userId = existing.id;
        Object.assign(existing, {
          passwordHash: null,
          totpSealed: null,
          totpLastStep: null,
          failedAttempts: 0,
          lockedUntil: null,
          disabledAt: null,
        });
        revokeSessionsOf(userId, input.at);
        revokeOpen(userId, input.at);
        if (input.role) setRole(userId, input.role, partner?.id ?? null);
      } else {
        if (!input.role) return { ok: false, reason: 'role_required' };
        if (!/^[a-z][a-z0-9_.-]{2,31}$/.test(input.username)) throw new Error('admin_users_username');
        userId = input.newUserId;
        users.set(userId, {
          id: userId,
          username: input.username,
          displayName: input.displayName,
          passwordHash: null,
          totpSealed: null,
          totpLastStep: null,
          failedAttempts: 0,
          lockedUntil: null,
          disabledAt: null,
          createdAt: input.at,
          createdBy: input.createdBy,
          lastLoginAt: null,
        });
        setRole(userId, input.role, partner?.id ?? null);
      }
      invites.push({
        id: input.inviteId,
        adminUserId: userId,
        tokenHash: input.tokenHash,
        totpSealed: input.totpSealed,
        createdAt: input.at,
        expiresAt: input.expiresAt,
        usedAt: null,
        revokedAt: null,
        createdBy: input.createdBy,
      });
      addEvent({
        ...input.event,
        targetId: userId,
        at: input.at,
        detail: {
          ...(input.event.detail as object),
          ...(partner ? { partner: { id: partner.id, name: partner.name } } : {}),
          reset: Boolean(existing),
        },
      });
      return { ok: true, userId, reset: Boolean(existing) };
    },

    async findInvite(tokenHash) {
      const invite = invites.find((i) => i.tokenHash === tokenHash);
      if (!invite) return null;
      const user = users.get(invite.adminUserId)!;
      return { invite: { ...invite }, user: { ...user }, roles: [...(roles.get(user.id) ?? [])].sort(), partner: partnerRef(user.id) };
    },

    async completeInvite(input) {
      const invite = invites.find((i) => i.id === input.inviteId);
      if (!invite || invite.usedAt || invite.revokedAt || invite.expiresAt.getTime() <= input.at.getTime()) return false;
      invite.usedAt = input.at;
      const user = users.get(input.userId)!;
      if (!user.disabledAt) {
        Object.assign(user, {
          passwordHash: input.passwordHash,
          totpSealed: input.totpSealed,
          totpLastStep: input.totpStep,
          failedAttempts: 0,
          lockedUntil: null,
          lastLoginAt: input.at,
        });
      }
      sessions.push({
        id: `s${++sessionSeq}`,
        tokenHash: input.session.tokenHash,
        adminUserId: input.userId,
        createdAt: input.at,
        expiresAt: input.session.expiresAt,
        lastSeenAt: input.at,
        revokedAt: null,
      });
      addEvent({ adminUserId: input.userId, action: 'admins.enroll', targetType: 'admin', targetId: input.userId, ipHash: input.ipHash, at: input.at });
      addEvent({ adminUserId: input.userId, action: 'auth.login', ipHash: input.ipHash, at: input.at });
      return true;
    },

    async listAdmins(at) {
      return [...users.values()]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((user) => {
          const open = invites
            .filter((i) => i.adminUserId === user.id && !i.usedAt && !i.revokedAt && i.expiresAt.getTime() > at.getTime())
            .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
          return {
            user: { ...user },
            roles: [...(roles.get(user.id) ?? [])].sort(),
            partner: partnerRef(user.id),
            invite: open ? { expiresAt: open.expiresAt } : null,
          };
        });
    },

    async partnerChoices() {
      return [...partners.values()]
        .filter((partner) => partner.active)
        .sort((a, b) => Number(a.isDefault) - Number(b.isDefault))
        .map(({ active: _active, ...partner }) => partner);
    },

    async disableUser(userId, at, event) {
      const user = users.get(userId);
      if (!user || user.disabledAt) return 'not_found';
      const owners = activeOwners();
      if (owners.includes(userId) && owners.length <= 1) return 'last_owner';
      user.disabledAt = at;
      revokeSessionsOf(userId, at);
      revokeOpen(userId, at);
      addEvent(event);
      return 'ok';
    },

    async revokeInvites(userId, at, event) {
      const n = revokeOpen(userId, at);
      if (n === 0) return 0;
      const user = users.get(userId);
      if (user && !user.passwordHash && !user.lastLoginAt && !user.disabledAt) user.disabledAt = at;
      addEvent(event);
      return n;
    },

    async logEvent(event) {
      addEvent(event);
    },

    async listEvents(query) {
      return events
        .filter((e) => (query.beforeId ? e.id < query.beforeId : true))
        .filter((e) => (query.actionPrefix ? e.action.startsWith(`${query.actionPrefix}.`) : true))
        .sort((a, b) => b.id - a.id)
        .slice(0, query.limit)
        .map((e) => {
          const user = e.adminUserId ? users.get(e.adminUserId) : undefined;
          return { ...e, username: user?.username ?? null, displayName: user?.displayName ?? null };
        });
    },
  };
}
