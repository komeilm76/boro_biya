<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  administrativePermissionKeys,
  adminUsersQuerySchema,
  adminAuditQuerySchema,
  type AdminUsersQuery,
  type AdminAuditQuery,
} from '@boro-biya/validation';
import { authClient } from '../auth-client.js';
import { useSessionStore } from '../stores/session.js';
const session = useSessionStore();
const router = useRouter();
const { locale } = useI18n();
const users = ref<Awaited<ReturnType<typeof authClient.adminUsers>>>({ items: [], nextCursor: null });
const roles = ref<Awaited<ReturnType<typeof authClient.adminRoles>>>({ items: [], permissions: [], nextCursor: null });
const audits = ref<Awaited<ReturnType<typeof authClient.adminAudit>>>({ items: [], nextCursor: null });
const target = ref('');
const action = ref('lock');
const reason = ref('');
const password = ref('');
const roleIds = ref<string[]>([]);
const editingRole = ref('');
const roleKey = ref('');
const roleName = ref('');
const permissions = ref<string[]>([]);
const busy = ref(false);
const failed = ref(false);
const accepted = ref(false);
const credential = ref<Awaited<ReturnType<typeof authClient.reissueSetupCredential>> | null>(null);
const searchUsername = ref('');
const searchStatus = ref('');
const searchSetup = ref('');
const searchRole = ref('');
const auditActor = ref('');
const auditAction = ref('');
const auditTarget = ref('');
const auditType = ref('');
const auditFrom = ref('');
const auditTo = ref('');
const userQuery = ref<AdminUsersQuery>({});
const auditQuery = ref<AdminAuditQuery>({});
let epoch = 0;
let mutation = 0;
let usersRead = 0;
let rolesRead = 0;
let auditRead = 0;
const owner = () => ({ token: session.accessToken ?? '', version: session.authVersion });
const current = (snapshot: ReturnType<typeof owner>) =>
  Boolean(snapshot.token) &&
  snapshot.token === session.accessToken &&
  snapshot.version === session.authVersion &&
  session.isAuthenticated;
function clearData() {
  searchUsername.value = '';
  searchStatus.value = '';
  searchSetup.value = '';
  searchRole.value = '';
  auditActor.value = '';
  auditAction.value = '';
  auditTarget.value = '';
  auditType.value = '';
  auditFrom.value = '';
  auditTo.value = '';
  userQuery.value = {};
  auditQuery.value = {};
  epoch++;
  mutation++;
  users.value = { items: [], nextCursor: null };
  roles.value = { items: [], permissions: [], nextCursor: null };
  audits.value = { items: [], nextCursor: null };
  target.value = '';
  reason.value = '';
  password.value = '';
  roleIds.value = [];
  editingRole.value = '';
  roleKey.value = '';
  roleName.value = '';
  permissions.value = [];
  credential.value = null;
  busy.value = false;
  failed.value = false;
  accepted.value = false;
}
watch([() => session.accessToken, () => session.authVersion, () => session.permissions?.join('|')], clearData, {
  flush: 'sync',
});
onUnmounted(clearData);
const actions = ['lock', 'unlock', 'ban', 'unban', 'deactivate', 'reactivate'];
function allowed(permission: string) {
  return session.permissions?.includes(permission) === true;
}
function date(value: string) {
  return new Intl.DateTimeFormat(locale.value === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
async function readUsers(cursor?: string) {
  const snapshot = owner(),
    generation = epoch,
    ticket = ++usersRead;
  try {
    const result = await authClient.adminUsers(snapshot.token, { ...userQuery.value, cursor });
    if (current(snapshot) && generation === epoch && ticket === usersRead && allowed('users.read'))
      users.value = result;
  } catch {
    if (current(snapshot) && generation === epoch && ticket === usersRead) failed.value = true;
  }
}
async function readRoles(cursor?: string) {
  const snapshot = owner(),
    generation = epoch,
    ticket = ++rolesRead;
  const previous = cursor ? roles.value.items : [];
  try {
    const result = await authClient.adminRoles(snapshot.token, cursor);
    if (current(snapshot) && generation === epoch && ticket === rolesRead && allowed('roles.read'))
      roles.value = { ...result, items: [...previous, ...result.items] };
  } catch {
    if (current(snapshot) && generation === epoch && ticket === rolesRead) failed.value = true;
  }
}
async function load() {
  await Promise.all([allowed('users.read') ? readUsers() : undefined, allowed('roles.read') ? readRoles() : undefined]);
}
onMounted(load);
async function nextRoles() {
  if (allowed('roles.read')) await readRoles(roles.value.nextCursor ?? undefined);
}
async function nextUsers() {
  if (allowed('users.read')) await readUsers(users.value.nextCursor ?? undefined);
}
async function audit(next = false) {
  if (!allowed('audit.read')) return;
  const snapshot = owner(),
    generation = epoch,
    ticket = ++auditRead;
  try {
    const result = await authClient.adminAudit(snapshot.token, {
      ...auditQuery.value,
      cursor: next ? (audits.value.nextCursor ?? undefined) : undefined,
    });
    if (current(snapshot) && generation === epoch && ticket === auditRead) audits.value = result;
  } catch {
    if (current(snapshot) && generation === epoch && ticket === auditRead) failed.value = true;
  }
}
async function searchUsers() {
  if (!allowed('users.read')) return;
  const parsed = adminUsersQuerySchema.safeParse({
    username: searchUsername.value || undefined,
    status: searchStatus.value || undefined,
    setupRequired: searchSetup.value || undefined,
    roleId: searchRole.value || undefined,
  });
  usersRead++;
  users.value = { items: [], nextCursor: null };
  failed.value = false;
  if (!parsed.success) {
    failed.value = true;
    return;
  }
  userQuery.value = parsed.data;
  await readUsers();
}
async function searchAudit() {
  if (!allowed('audit.read')) return;
  const parsed = adminAuditQuerySchema.safeParse({
    actorId: auditActor.value || undefined,
    action: auditAction.value || undefined,
    targetId: auditTarget.value || undefined,
    targetType: auditType.value || undefined,
    from: auditFrom.value || undefined,
    to: auditTo.value || undefined,
  });
  auditRead++;
  audits.value = { items: [], nextCursor: null };
  failed.value = false;
  if (!parsed.success) {
    failed.value = true;
    return;
  }
  auditQuery.value = parsed.data;
  await audit();
}
function edit() {
  const role = roles.value.items.find((item) => item.id === editingRole.value);
  roleKey.value = role?.key ?? '';
  roleName.value = role?.nameKey ?? '';
  permissions.value = [...(role?.permissions ?? [])];
}
async function change(kind: 'state' | 'assign' | 'role' | 'reissue') {
  if (busy.value) return;
  const snapshot = owner(),
    ticket = ++mutation,
    targetId = target.value;
  credential.value = null;
  busy.value = true;
  failed.value = false;
  accepted.value = false;
  try {
    const token = snapshot.token;
    let reissued: Awaited<ReturnType<typeof authClient.reissueSetupCredential>> | null = null;
    if (kind === 'state') await authClient.adminState(target.value, action.value, reason.value, password.value, token);
    else if (kind === 'assign') await authClient.adminAssignRoles(target.value, roleIds.value, password.value, token);
    else if (kind === 'reissue')
      reissued = await authClient.reissueSetupCredential(targetId, reason.value, password.value, token);
    else
      await authClient.adminSaveRole(
        editingRole.value || undefined,
        { key: roleKey.value, nameKey: roleName.value, permissions: permissions.value },
        password.value,
        token,
      );
    if (!current(snapshot) || ticket !== mutation) return;
    credential.value = reissued;
    accepted.value = true;
    if (kind === 'state' && targetId === session.userId) {
      session.clearSession();
      await router.push('/_auth/login');
    } else {
      const profile = await authClient.me(token);
      if (!current(snapshot) || ticket !== mutation) return;
      session.$patch({ roles: profile.roles, permissions: profile.permissions });
      if (!session.isAdmin) await router.push('/_user');
      else await load();
    }
  } catch {
    if (current(snapshot) && ticket === mutation) failed.value = true;
  } finally {
    if (ticket === mutation) {
      password.value = '';
      busy.value = false;
    }
  }
}
</script>
<template>
  <section class="my-6">
    <h2>{{ $t('adminManage.title') }}</h2>
    <p>{{ $t('adminManage.notice') }}</p>
    <p v-if="failed" role="alert">{{ $t('auth.rejected') }}</p>
    <p v-if="accepted" role="status">{{ $t('adminManage.accepted') }}</p>
    <button type="button" :disabled="busy" @click="load">{{ $t('adminManage.refresh') }}</button>
    <fieldset :disabled="busy || !allowed('users.read')" class="grid gap-3" @keydown.enter.prevent="searchUsers">
      <legend>{{ $t('adminSearch.users') }}</legend>
      <label for="search-username">{{ $t('auth.username') }}</label
      ><input id="search-username" v-model="searchUsername" maxlength="256" />
      <label for="search-status">{{ $t('adminManage.state') }}</label>
      <select id="search-status" v-model="searchStatus">
        <option value="">{{ $t('adminSearch.all') }}</option>
        <option v-for="state in ['active', 'locked', 'banned', 'deactivated']" :key="state" :value="state">
          {{ $t(`adminManage.states.${state}`) }}
        </option>
      </select>
      <label for="search-setup">{{ $t('adminSearch.setup') }}</label>
      <select id="search-setup" v-model="searchSetup">
        <option value="">{{ $t('adminSearch.all') }}</option>
        <option value="true">{{ $t('adminSearch.pending') }}</option>
        <option value="false">{{ $t('adminSearch.complete') }}</option>
      </select>
      <label for="search-role">{{ $t('adminManage.role') }}</label
      ><select id="search-role" v-model="searchRole">
        <option value="">{{ $t('adminSearch.all') }}</option>
        <option v-for="role in roles.items" :key="role.id" :value="role.id">{{ role.key }}</option>
      </select>
      <button type="button" data-action="search-users" @click="searchUsers">{{ $t('adminSearch.apply') }}</button>
    </fieldset>
    <ul>
      <li v-for="user in users.items" :key="user.id">
        {{ user.username }} {{ $t(`adminManage.states.${user.status}`) }}
        <time :datetime="user.stateChangedAt">{{ date(user.stateChangedAt) }}</time
        ><span v-if="user.reason"> {{ user.reason }}</span>
      </li>
    </ul>
    <button v-if="users.nextCursor" type="button" :disabled="busy" data-action="next-users" @click="nextUsers">
      {{ $t('adminManage.next') }}
    </button>
    <button v-if="roles.nextCursor" type="button" :disabled="busy" @click="nextRoles">
      {{ $t('adminManage.next') }}
    </button>
    <label for="managed-user">{{ $t('adminManage.user') }}</label>
    <select id="managed-user" v-model="target" :disabled="busy">
      <option v-for="user in users.items" :key="user.id" :value="user.id">{{ user.username }}</option>
    </select>
    <label for="management-password">{{ $t('auth.currentPassword') }}</label>
    <input
      id="management-password"
      v-model="password"
      type="password"
      autocomplete="current-password"
      maxlength="128"
      :disabled="busy"
    />
    <form :aria-busy="busy" @submit.prevent="change('state')">
      <fieldset :disabled="busy || !allowed('users.state')" class="grid gap-3">
        <legend>{{ $t('adminManage.state') }}</legend>
        <label for="managed-action">{{ $t('adminManage.action') }}</label>
        <select id="managed-action" v-model="action">
          <option v-for="entry in actions" :key="entry" :value="entry">{{ $t(`adminManage.actions.${entry}`) }}</option>
        </select>
        <label for="managed-reason">{{ $t('adminManage.reason') }}</label
        ><textarea id="managed-reason" v-model="reason" required maxlength="500" />
        <button type="submit">{{ $t('adminManage.apply') }}</button>
      </fieldset>
    </form>
    <form :aria-busy="busy" @submit.prevent="change('assign')">
      <fieldset :disabled="busy || !allowed('users.roles')" class="grid gap-3">
        <legend>{{ $t('adminManage.assign') }}</legend>
        <p>{{ $t('adminManage.replaceWarning') }}</p>
        <label for="managed-role-ids">{{ $t('adminManage.roles') }}</label>
        <select id="managed-role-ids" v-model="roleIds" multiple>
          <option v-for="role in roles.items" :key="role.id" :value="role.id">{{ role.key }}</option>
        </select>
        <button type="submit">{{ $t('adminManage.apply') }}</button>
      </fieldset>
    </form>
    <form :aria-busy="busy" @submit.prevent="change('role')">
      <fieldset :disabled="busy || !allowed('roles.manage')" class="grid gap-3">
        <legend>{{ $t('adminManage.editRole') }}</legend>
        <label for="managed-role">{{ $t('adminManage.role') }}</label>
        <select id="managed-role" v-model="editingRole" @change="edit">
          <option value="">{{ $t('adminManage.newRole') }}</option>
          <option v-for="role in roles.items" :key="role.id" :value="role.id">{{ role.key }}</option>
        </select>
        <label v-if="!editingRole" for="managed-key">{{ $t('adminManage.key') }}</label
        ><input v-if="!editingRole" id="managed-key" v-model="roleKey" required maxlength="64" />
        <label for="managed-name">{{ $t('adminManage.nameKey') }}</label
        ><input id="managed-name" v-model="roleName" required maxlength="86" />
        <label for="managed-permissions">{{ $t('adminManage.permissions') }}</label>
        <select id="managed-permissions" v-model="permissions" multiple>
          <option v-for="permission in administrativePermissionKeys" :key="permission" :value="permission">
            {{ permission }}
          </option>
        </select>
        <button type="submit">{{ $t('adminManage.save') }}</button>
      </fieldset>
    </form>
    <form :aria-busy="busy" @submit.prevent="change('reissue')">
      <fieldset :disabled="busy || !allowed('users.state')" class="grid gap-3">
        <legend>{{ $t('adminManage.reissue') }}</legend>
        <p>{{ $t('adminManage.reissueWarning') }}</p>
        <label for="reissue-reason">{{ $t('adminManage.reason') }}</label>
        <textarea id="reissue-reason" v-model="reason" required maxlength="500" />
        <button type="submit">{{ $t('adminManage.reissue') }}</button>
      </fieldset>
    </form>
    <output v-if="credential" class="block my-4">
      <p>{{ $t('adminCreate.notice') }}</p>
      <p>{{ credential.username }}</p>
      <code>{{ credential.setupCredential }}</code>
      <button type="button" @click="credential = null">{{ $t('adminCreate.forget') }}</button>
      <time :datetime="credential.expiresAt">{{ date(credential.expiresAt) }}</time>
    </output>
    <fieldset :disabled="busy || !allowed('audit.read')" class="grid gap-3" @keydown.enter.prevent="searchAudit">
      <legend>{{ $t('adminSearch.audit') }}</legend>
      <label for="search-actor">{{ $t('adminSearch.actor') }}</label
      ><input id="search-actor" v-model="auditActor" maxlength="36" />
      <label for="search-audit-action">{{ $t('adminManage.action') }}</label
      ><input id="search-audit-action" v-model="auditAction" maxlength="80" />
      <label for="search-target">{{ $t('adminSearch.target') }}</label
      ><input id="search-target" v-model="auditTarget" maxlength="36" />
      <label for="search-target-type">{{ $t('adminSearch.targetType') }}</label
      ><input id="search-target-type" v-model="auditType" maxlength="80" />
      <p>{{ $t('adminSearch.utc') }}</p>
      <label for="search-from">{{ $t('adminSearch.from') }}</label
      ><input id="search-from" v-model="auditFrom" maxlength="30" />
      <label for="search-to">{{ $t('adminSearch.to') }}</label
      ><input id="search-to" v-model="auditTo" maxlength="30" />
      <button type="button" data-action="search-audit" @click="searchAudit">{{ $t('adminSearch.apply') }}</button>
    </fieldset>
    <button type="button" :disabled="busy || !allowed('audit.read')" @click="audit(false)">
      {{ $t('adminManage.audit') }}
    </button>
    <ul>
      <li v-for="event in audits.items" :key="event.id">
        {{ event.action }} <time :datetime="event.createdAt">{{ date(event.createdAt) }}</time
        ><span v-if="event.targetId"> {{ event.targetId }}</span>
      </li>
    </ul>
    <button v-if="audits.nextCursor" type="button" data-action="next-audit" @click="audit(true)">
      {{ $t('adminManage.next') }}
    </button>
  </section>
</template>
