import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8L44QasRBrZHC1sp7TVvXuj6GKxZoM0c",
  authDomain: "anti-buraot.firebaseapp.com",
  projectId: "anti-buraot",
  storageBucket: "anti-buraot.firebasestorage.app",
  messagingSenderId: "883642206216",
  appId: "1:883642206216:web:feb4d8574a19736b9b69bd",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const clean = value => JSON.parse(JSON.stringify(value));
const fingerprint = value => JSON.stringify(clean(value));

function expenseDocuments(group) {
  return [
    ...(group.expenses || []).map(expense => ({ ...clean(expense), isDeleted: false })),
    ...(group.deletedExpenses || []).map(expense => ({ ...clean(expense), isDeleted: true })),
  ];
}

function groupMetadata(group, uid) {
  const {
    expenses,
    deletedExpenses,
    payments,
    updatedAt,
    ...metadata
  } = clean(group);
  const accessUids = Array.isArray(metadata.accessUids) && metadata.accessUids.length
    ? metadata.accessUids
    : [uid];
  return {
    ...metadata,
    id: group.id,
    ownerUid: metadata.ownerUid || uid,
    accessUids,
    visibility: metadata.visibility === "public" ? "public" : "private",
    lastInviteRedemption: metadata.visibility === "public" ? null : metadata.lastInviteRedemption || null,
    schemaVersion: 1,
  };
}

function sortNewestFirst(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt || a.deletedAt || 0) || 0;
    const bTime = Date.parse(b.updatedAt || b.createdAt || b.deletedAt || 0) || 0;
    return bTime - aTime;
  });
}

async function hydrateGroup(groupSnapshot) {
  const groupId = groupSnapshot.id;
  const [expenseSnapshot, paymentSnapshot] = await Promise.all([
    getDocs(collection(db, "groups", groupId, "expenses")),
    getDocs(collection(db, "groups", groupId, "payments")),
  ]);
  const expenseDocuments = expenseSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const payments = paymentSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  return {
    ...groupSnapshot.data(),
    id: groupId,
    expenses: sortNewestFirst(expenseDocuments.filter(expense => !expense.isDeleted)),
    deletedExpenses: sortNewestFirst(expenseDocuments.filter(expense => expense.isDeleted)),
    payments: sortNewestFirst(payments),
  };
}

function createKnownSnapshot(groups, uid) {
  return new Map(groups.map((group, sortIndex) => [group.id, {
    metadata: fingerprint({ ...groupMetadata(group, uid), sortIndex }),
    expenses: new Map(expenseDocuments(group).map(expense => [expense.id, fingerprint(expense)])),
    payments: new Map((group.payments || []).map(payment => [payment.id, fingerprint(payment)])),
    ownerUid: group.ownerUid || uid,
    editable: (group.accessUids || [uid]).includes(uid),
  }]));
}

async function commitOperations(operations) {
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    operations.slice(index, index + 400).forEach(operation => {
      if (operation.type === "set") batch.set(operation.reference, operation.data, operation.options);
      else batch.delete(operation.reference);
    });
    await batch.commit();
  }
}

export async function connectFirebaseStore(localGroups, onGroupsChanged, onError = console.error) {
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  const uid = user.uid;
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  let inviteResult = null;

  if (inviteToken) {
    try {
      const inviteSnapshot = await getDoc(doc(db, "invites", inviteToken));
      if (!inviteSnapshot.exists()) throw new Error("This invite link is invalid.");
      const invite = inviteSnapshot.data();
      const expiresAt = invite.expiresAt?.toDate?.() || new Date(invite.expiresAt);
      if (!invite.active || expiresAt < new Date()) throw new Error("This invite link has expired.");
      const groupReference = doc(db, "groups", invite.groupId);
      const batch = writeBatch(db);
      batch.update(groupReference, {
        accessUids: arrayUnion(uid),
        lastInviteRedemption: { uid, token: inviteToken },
        updatedAt: new Date().toISOString(),
      });
      await batch.commit();
      inviteResult = { ok: true, groupName: invite.groupName || "Private group" };
    } catch (error) {
      inviteResult = { ok: false, message: error.message || "This invite could not be accepted." };
    }
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("invite");
    window.history.replaceState({}, "", cleanUrl);
  }

  const accessQuery = query(collection(db, "groups"), where("accessUids", "array-contains", uid));
  const publicQuery = query(collection(db, "groups"), where("visibility", "==", "public"));
  const [initialAccessSnapshot, initialPublicSnapshot] = await Promise.all([
    getDocs(accessQuery),
    getDocs(publicQuery),
  ]);
  const initialDocuments = new Map();
  [...initialAccessSnapshot.docs, ...initialPublicSnapshot.docs].forEach(item => initialDocuments.set(item.id, item));
  const remoteGroups = await Promise.all([...initialDocuments.values()].map(hydrateGroup));
  const mergedGroups = [...remoteGroups];
  const remoteIds = new Set(remoteGroups.map(group => group.id));
  localGroups.forEach(group => {
    if (!remoteIds.has(group.id)) mergedGroups.push({ ...clean(group), ownerUid: uid, accessUids: [uid] });
  });

  let known = createKnownSnapshot(remoteGroups, uid);
  let syncQueue = Promise.resolve();

  async function syncNow(groups) {
    const snapshot = clean(groups);
    const currentIds = new Set(snapshot.map(group => group.id));
    const operations = [];

    for (const [groupId] of known) {
      if (currentIds.has(groupId)) continue;
      const previous = known.get(groupId);
      if (previous.ownerUid !== uid) continue;
      const [expenseSnapshot, paymentSnapshot] = await Promise.all([
        getDocs(collection(db, "groups", groupId, "expenses")),
        getDocs(collection(db, "groups", groupId, "payments")),
      ]);
      expenseSnapshot.docs.forEach(item => operations.push({ type: "delete", reference: item.ref }));
      paymentSnapshot.docs.forEach(item => operations.push({ type: "delete", reference: item.ref }));
      operations.push({ type: "delete", reference: doc(db, "groups", groupId) });
    }

    snapshot.forEach((group, sortIndex) => {
      const hasAccess = !Array.isArray(group.accessUids) || group.accessUids.includes(uid);
      const isPublicWriter = group.visibility === "public" && !hasAccess;
      if (!hasAccess && !isPublicWriter) return;
      const metadata = { ...groupMetadata(group, uid), sortIndex };
      const previous = known.get(group.id);
      const metadataChanged = !previous || previous.metadata !== fingerprint(metadata);
      const groupReference = doc(db, "groups", group.id);
      operations.push({
        type: "set",
        reference: groupReference,
        data: isPublicWriter
          ? {
              tripStartDate: metadata.tripStartDate || null,
              tripEndDate: metadata.tripEndDate || null,
              testOffset: metadata.testOffset || 0,
              updatedAt: new Date().toISOString(),
            }
          : metadataChanged
            ? { ...metadata, updatedAt: new Date().toISOString() }
            : { updatedAt: new Date().toISOString() },
        options: { merge: true },
      });

      expenseDocuments(group).forEach(expense => {
        if (previous?.expenses.get(expense.id) === fingerprint(expense)) return;
        operations.push({
          type: "set",
          reference: doc(db, "groups", group.id, "expenses", expense.id),
          data: expense,
          options: { merge: false },
        });
      });

      (group.payments || []).forEach(payment => {
        if (previous?.payments.get(payment.id) === fingerprint(payment)) return;
        operations.push({
          type: "set",
          reference: doc(db, "groups", group.id, "payments", payment.id),
          data: clean(payment),
          options: { merge: false },
        });
      });
    });

    if (operations.length) await commitOperations(operations);
    known = createKnownSnapshot(snapshot, uid);
  }

  function sync(groups) {
    const snapshot = clean(groups);
    syncQueue = syncQueue.then(() => syncNow(snapshot)).catch(error => onError(error));
    return syncQueue;
  }

  if (mergedGroups.length) await syncNow(mergedGroups);

  let latestAccessSnapshot = initialAccessSnapshot;
  let latestPublicSnapshot = initialPublicSnapshot;
  let refreshVersion = 0;

  async function refreshGroups() {
    const version = ++refreshVersion;
    try {
      const documents = new Map();
      [...latestAccessSnapshot.docs, ...latestPublicSnapshot.docs].forEach(item => documents.set(item.id, item));
      const groups = await Promise.all([...documents.values()].map(hydrateGroup));
      if (version !== refreshVersion) return;
      groups.sort((a, b) => (a.sortIndex ?? 9999) - (b.sortIndex ?? 9999));
      known = createKnownSnapshot(groups, uid);
      onGroupsChanged(groups);
    } catch (error) {
      onError(error);
    }
  }

  const unsubscribeAccess = onSnapshot(accessQuery, snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    latestAccessSnapshot = snapshot;
    refreshGroups();
  }, onError);
  const unsubscribePublic = onSnapshot(publicQuery, snapshot => {
    if (snapshot.metadata.hasPendingWrites) return;
    latestPublicSnapshot = snapshot;
    refreshGroups();
  }, onError);

  async function createInvite(groupId, groupName) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
    await setDoc(doc(db, "invites", token), {
      groupId,
      groupName,
      createdBy: uid,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
      active: true,
    });
    return token;
  }

  return {
    uid,
    groups: mergedGroups,
    inviteResult,
    sync,
    createInvite,
    unsubscribe() {
      unsubscribeAccess();
      unsubscribePublic();
    },
  };
}
