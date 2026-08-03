"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Ban, CheckCircle, Trash2, Key, Search, Filter, Loader2 } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog, PromptDialog } from "@/components/ui/dialogs";
import { api } from "@/lib/api";

const REGIONS = ["Greater Accra", "Ashanti", "Central", "Eastern", "Northern", "Western", "Volta", "Oti", "Bono", "Ahafo"];

export default function UserManagementPage() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ full_name: "", email: "", role_code: "", assigned_hub_id: "", assigned_region: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Dialog states
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [userToToggle, setUserToToggle] = useState<any>(null);
  const [userToReset, setUserToReset] = useState<any>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // DEFENSIVE QUERY: Ensure we extract the array properly
  const users = useQuery({ 
    queryKey: ["users"], 
    queryFn: async () => {
      const response = await api.get("/users");
      // Handle cases where backend wraps response in { items: [...] } or returns raw [...]
      return Array.isArray(response.data) ? response.data : (response.data?.items || []);
    }
  });
  
  const hubs = useQuery({ 
    queryKey: ["hubs"], 
    queryFn: async () => (await api.get<any[]>("/distribution/hubs")).data 
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const payload = {
        full_name: form.full_name,
        email: form.email,
        role_code: form.role_code,
        hub_id: form.role_code === "HUB_OFFICER" && form.assigned_hub_id ? form.assigned_hub_id : null,
        assigned_region: form.role_code === "REGIONAL_MANAGER" && form.assigned_region ? form.assigned_region : null
      };
      return api.post("/auth/create-user", payload);
    },
    onSuccess: async () => {
      setForm({ full_name: "", email: "", role_code: "", assigned_hub_id: "", assigned_region: "" });
      setError(null);
      setSuccess("User created successfully! The system has emailed them their secure login instructions.");
      setTimeout(() => setSuccess(null), 5000);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => {
      setSuccess(null);
      setError(err.response?.data?.detail || "Failed to create user.");
    }
  });

  const toggleAccess = useMutation({
    mutationFn: async (userId: string) => api.patch(`/users/${userId}/toggle`),
    onSuccess: async () => {
      setUserToToggle(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Failed to toggle access."),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => api.delete(`/users/${userId}`),
    onSuccess: async () => {
      setUserToDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Failed to delete user."),
  });

  const resetPassword = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string, newPassword: string }) =>
      api.post(`/users/${userId}/reset-password`, { new_password: newPassword }),
    onSuccess: () => {
      setUserToReset(null);
      alert("Password successfully reset!");
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Failed to reset password."),
  });

  // DEFENSIVE FILTERING
  const filteredUsers = useMemo(() => {
    let list = users.data || [];
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((u: any) => 
        (u.full_name || "").toLowerCase().includes(q) || 
        (u.email || "").toLowerCase().includes(q)
      );
    }
    if (roleFilter) list = list.filter((u: any) => u.role?.code === roleFilter);
    if (statusFilter) {
      const isActive = statusFilter === "active";
      list = list.filter((u: any) => u.is_active === isActive);
    }
    return list;
  }, [users.data, searchQuery, roleFilter, statusFilter]);

  return (
    <AppShell title="User Management" description="Provision system access and manage staff roles.">
      {error && <div className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
      {success && <div className="mb-6 rounded-md bg-green-50 px-4 py-3 text-sm font-medium text-green-700">{success}</div>}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        
        {/* CREATE USER FORM */}
        <form onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }} className="rounded-md border border-line bg-white p-6 h-fit shadow-sm">
          <div className="mb-6 flex items-center gap-2 border-b border-line pb-3">
            <UserPlus className="h-6 w-6 text-brand" />
            <h2 className="text-lg font-semibold text-ink">Provision New User</h2>
          </div>
          <div className="grid gap-4">
            <TextField label="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            <TextField label="Email Address" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <SelectField label="System Role" value={form.role_code} onChange={(e) => setForm({ ...form, role_code: e.target.value, assigned_hub_id: "", assigned_region: "" })} required>
              <option value="">Select Role...</option>
              <option value="MANUFACTURER">Manufacturer</option>
              <option value="WAREHOUSE_OFFICER">Warehouse Officer</option>
              <option value="DISTRIBUTION_TEAM">Distribution Team (Global)</option>
              <option value="REGIONAL_MANAGER">Regional Manager</option>
              <option value="HUB_OFFICER">Hub Officer</option>
              <option value="MANAGER">Manager (Read-Only Global)</option>
              <option value="SUPER_ADMIN">Super Admin (IT)</option>
            </SelectField>
            {form.role_code === "HUB_OFFICER" && (
              <SelectField label="Assign to Hub" value={form.assigned_hub_id} onChange={(e) => setForm({ ...form, assigned_hub_id: e.target.value })} required>
                <option value="">Select Hub...</option>
                {(hubs.data ?? []).map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
              </SelectField>
            )}
            {form.role_code === "REGIONAL_MANAGER" && (
              <SelectField label="Assign Region" value={form.assigned_region} onChange={(e) => setForm({ ...form, assigned_region: e.target.value })} required>
                <option value="">Select Region...</option>
                {REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
              </SelectField>
            )}
            <ActionButton disabled={createUser.isPending} type="submit" className="w-full mt-2 h-10">
              {createUser.isPending ? "Provisioning..." : "Create Account"}
            </ActionButton>
          </div>
        </form>

        {/* USERS DIRECTORY TABLE */}
        <section className="rounded-md border border-line bg-white shadow-sm h-fit overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-600" />
              <h2 className="text-sm font-semibold text-ink">System Access Directory</h2>
            </div>
            
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input type="text" placeholder="Search users..." className="h-9 w-48 rounded-md border border-line pl-8 pr-3 text-sm outline-none focus:border-brand" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <select className="h-9 w-36 rounded-md border border-line pl-7 pr-3 text-sm outline-none focus:border-brand bg-white" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="">All Roles</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="DISTRIBUTION_TEAM">Distribution</option>
                  <option value="WAREHOUSE_OFFICER">Warehouse</option>
                  <option value="HUB_OFFICER">Hub</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0 z-10 shadow-sm border-b border-line">
                <tr>
                  <th className="px-4 py-3">Staff Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Access Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {/* EXPLICIT LOADING & ERROR STATES */}
                {users.isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-brand mb-2" />
                        <p>Loading directory...</p>
                      </div>
                    </td>
                  </tr>
                ) : users.isError ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-red-500">
                      <p className="font-bold">Error loading users.</p>
                      <p className="text-xs mt-1">Please ensure you have network connectivity and adequate permissions.</p>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                      No users found matching your current filters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user: any) => (
                    <tr key={user.id} className={user.is_active ? "hover:bg-slate-50 transition-colors" : "bg-danger-50/50"}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{user.full_name || "Unknown Name"}</div>
                        <div className="text-xs text-slate-500">{user.email || "No Email"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[10px] font-bold text-brand bg-brand-50 px-2 py-1 rounded border border-brand/20 uppercase tracking-wider">
                          {/* SAFE CHAINING to prevent null crashes */}
                          {user.role?.code?.replace(/_/g, " ") || "UNASSIGNED"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={user.is_active ? "success" : "danger"}>
                          {user.is_active ? "Active" : "Locked Out"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {user.email !== "ishmael@upenergygroup.com" ? (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setUserToReset(user)} className="p-1.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors" title="Force Password Reset"><Key className="h-4 w-4" /></button>
                            <button onClick={() => setUserToToggle(user)} className={`p-1.5 rounded transition-colors ${user.is_active ? "bg-warning-50 text-warning hover:bg-warning-100" : "bg-success-50 text-success hover:bg-success-100"}`} title={user.is_active ? "Revoke Access" : "Restore Access"}>
                              {user.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                            </button>
                            <button onClick={() => setUserToDelete(user)} className="p-1.5 rounded bg-danger-50 text-danger hover:bg-red-100 transition-colors" title="Permanently Delete"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Master Account</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* SECURE DIALOGS */}
      <ConfirmDialog 
        isOpen={!!userToDelete} onClose={() => setUserToDelete(null)}
        title="Remove User Account"
        description="Are you sure you want to permanently delete this user? All access will be revoked immediately."
        confirmLabel="Remove User" variant="destructive"
        entityName={userToDelete?.full_name} isPending={deleteUser.isPending}
        onConfirm={() => { if (userToDelete) deleteUser.mutate(userToDelete.id); }}
      />

      <ConfirmDialog 
        isOpen={!!userToToggle} onClose={() => setUserToToggle(null)}
        title={userToToggle?.is_active ? "Revoke Access" : "Restore Access"}
        description={`This will instantly ${userToToggle?.is_active ? 'lock' : 'unlock'} this user's ability to log into the system.`}
        confirmLabel={userToToggle?.is_active ? "Lock Account" : "Restore Account"}
        variant="default" isPending={toggleAccess.isPending}
        onConfirm={() => { if (userToToggle) toggleAccess.mutate(userToToggle.id); }}
      />

      <PromptDialog 
        isOpen={!!userToReset} onClose={() => setUserToReset(null)}
        title="Force Password Reset"
        description={`Please enter a new temporary password for ${userToReset?.full_name}. They will be forced to change it on their next login.`}
        inputType="text" confirmLabel="Reset Password"
        isPending={resetPassword.isPending}
        onConfirm={(val: string) => { if (userToReset) resetPassword.mutate({ userId: userToReset.id, newPassword: val }); }}
      />
    </AppShell>
  );
}