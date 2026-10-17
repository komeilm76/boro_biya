<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { administrativePermissionKeys } from '@boro-biya/validation';
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
async function load() {
  try {
    if (allowed('users.read')) users.value = await authClient.adminUsers(session.accessToken ?? '');
    if (allowed('roles.read')) roles.value = await authClient.adminRoles(session.accessToken ?? '');
  } catch {
    failed.value = true;
  }
}
onMounted(load);
async function nextRoles() {
  try {
    const next = await authClient.adminRoles(session.accessToken ?? '', roles.value.nextCursor ?? undefined);
    roles.value = { ...next, items: [...roles.value.items, ...next.items] };
  } catch {
    failed.value = true;
  }
}
async function nextUsers() {
  try {
    users.value = await authClient.adminUsers(session.accessToken ?? '', users.value.nextCursor ?? undefined);
  } catch {
    failed.value = true;
  }
}
async function audit(next = false) {
  try {
    audits.value = await authClient.adminAudit(
      session.accessToken ?? '',
      next ? (audits.value.nextCursor ?? undefined) : undefined,
    );
  } catch {
    failed.value = true;
  }
}
function edit() {
  const role = roles.value.items.find((item) => item.id === editingRole.value);
  roleKey.value = role?.key ?? '';
  roleName.value = role?.nameKey ?? '';
  permissions.value = [...(role?.permissions ?? [])];
}
async function change(kind: 'state' | 'assign' | 'role') {
  if (busy.value) return;
  busy.value = true;
  failed.value = false;
  accepted.value = false;
  try {
    const token = session.accessToken ?? '';
    if (kind === 'state') await authClient.adminState(target.value, action.value, reason.value, password.value, token);
    else if (kind === 'assign') await authClient.adminAssignRoles(target.value, roleIds.value, password.value, token);
    else
      await authClient.adminSaveRole(
        editingRole.value || undefined,
        { key: roleKey.value, nameKey: roleName.value, permissions: permissions.value },
        password.value,
        token,
      );
    accepted.value = true;
    if (kind === 'state' && target.value === session.userId) {
      session.clearSession();
      await router.push('/_auth/login');
    } else {
      const profile = await authClient.me(token);
      session.$patch({ roles: profile.roles, permissions: profile.permissions });
      if (!session.isAdmin) await router.push('/_user');
      else await load();
    }
  } catch {
    failed.value = true;
  } finally {
    password.value = '';
    busy.value = false;
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
    <ul>
      <li v-for="user in users.items" :key="user.id">
        {{ user.username }} {{ $t(`adminManage.states.${user.status}`) }}
        <time :datetime="user.stateChangedAt">{{ date(user.stateChangedAt) }}</time
        ><span v-if="user.reason"> {{ user.reason }}</span>
      </li>
    </ul>
    <button v-if="users.nextCursor" type="button" :disabled="busy" @click="nextUsers">
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
    <button type="button" :disabled="busy || !allowed('audit.read')" @click="audit(false)">
      {{ $t('adminManage.audit') }}
    </button>
    <ul>
      <li v-for="event in audits.items" :key="event.id">
        {{ event.action }} <time :datetime="event.createdAt">{{ date(event.createdAt) }}</time
        ><span v-if="event.targetId"> {{ event.targetId }}</span>
      </li>
    </ul>
    <button v-if="audits.nextCursor" type="button" @click="audit(true)">{{ $t('adminManage.next') }}</button>
  </section>
</template>
