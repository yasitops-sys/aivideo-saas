import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, KeyRound, Trash2, LogOut, ShieldCheck, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import { Modal } from '../components/Modal';

export function Settings() {
  const { user, logout, refreshUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleting, setDeleting] = useState(false);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast('Name cannot be empty.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      await api('/api/auth/me', { method: 'PATCH', json: { full_name: fullName.trim() } });
      await refreshUser();
      toast('Profile updated.', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Update failed.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) {
      toast('New password must be at least 8 characters.', 'error');
      return;
    }
    if (newPw !== confirmPw) {
      toast('New passwords do not match.', 'error');
      return;
    }
    setChangingPw(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        json: { current_password: currentPw, new_password: newPw },
      });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      toast('Password changed successfully.', 'success');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Password change failed.', 'error');
    } finally {
      setChangingPw(false);
    }
  };

  const deleteAccount = async () => {
    if (!deletePw) {
      toast('Enter your password to confirm deletion.', 'error');
      return;
    }
    setDeleting(true);
    try {
      await api('/api/auth/me', { method: 'DELETE', json: { password: deletePw } });
      await logout();
      toast('Your account has been deleted.', 'info');
      navigate('/login', { replace: true });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Deletion failed.', 'error');
      setDeleting(false);
    }
  };

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your profile, security and account.
        </p>
      </div>

      {/* account info */}
      <div className="card p-5 sm:p-6">
        <h2 className="font-bold flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-violet-500" /> Account
        </h2>
        <div className="flex flex-col gap-2 text-sm">
          <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <Mail className="w-4 h-4" /> {user?.email}
            {user?.email_verified ? (
              <span className="badge bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3" /> Verified
              </span>
            ) : (
              <span className="badge bg-amber-500/15 text-amber-500 border border-amber-500/30">
                Unverified
              </span>
            )}
          </p>
          <p className="text-slate-500 dark:text-slate-400">
            Member since {formatDate(user?.created_at)}
          </p>
        </div>
      </div>

      {/* profile */}
      <div className="card p-5 sm:p-6">
        <h2 className="font-bold mb-4">Profile</h2>
        <form onSubmit={saveProfile} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={255}
            />
          </div>
          <button type="submit" className="btn-primary self-start" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      {/* password */}
      <div className="card p-5 sm:p-6">
        <h2 className="font-bold flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-violet-500" /> Change password
        </h2>
        <form onSubmit={changePassword} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="currentPw">Current password</label>
            <input
              id="currentPw"
              type="password"
              className="input"
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="newPw">New password</label>
              <input
                id="newPw"
                type="password"
                className="input"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="confirmPw">Confirm new password</label>
              <input
                id="confirmPw"
                type="password"
                className="input"
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn-primary self-start" disabled={changingPw}>
            {changingPw ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>

      {/* session */}
      <div className="card p-5 sm:p-6">
        <h2 className="font-bold mb-4">Session</h2>
        <button className="btn-secondary" onClick={doLogout}>
          <LogOut className="w-4 h-4" /> Log out of this device
        </button>
      </div>

      {/* danger zone */}
      <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-5 sm:p-6">
        <h2 className="font-bold text-red-600 dark:text-red-400 mb-2">Danger zone</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Deleting your account is permanent. Your videos, credits and history will be removed.
        </p>
        <button className="btn-danger" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="w-4 h-4" /> Delete account
        </button>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This action <strong>cannot be undone</strong>. All your videos, credits and
            transaction history will be permanently deleted.
          </p>
          <div>
            <label className="label" htmlFor="deletePw">Confirm with your password</label>
            <input
              id="deletePw"
              type="password"
              className="input"
              autoComplete="current-password"
              placeholder="Your password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button className="btn-danger" onClick={deleteAccount} disabled={deleting}>
              <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
