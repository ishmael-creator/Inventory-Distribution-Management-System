"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, UserPlus, Ban, CheckCircle, Trash2, Key, Search, Filter } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ActionButton } from "@/components/ui/action-button";
import { SelectField, TextField } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api";

export default function UserManagementPage() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({ full_name: "", email: "", role_code: "", assigned_hub_id: "", assigned_region: "" });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const REGIONS = ["Greater Accra", "Ashanti", "Central", "Eastern", "Northern", "Western", "Volta", "Oti", "Bono", "Ahafo"];

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<any[]>("/users")).data
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
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Failed to toggle access."),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => api.delete(`/users/${userId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => alert(err.response?.data?.detail || "Failed to delete user."),
  });

  const resetPassword = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string, newPassword: string }) =>
      api.post(`/users/${userId}/reset-password`, { new_password: newPassword }),
    onSuccess: () => alert("Password successfully reset!"),
    onError: (err: any) => alert(err.response?.data?.detail || "Failed to reset password."),
  });

  const handleDelete = (userId: string) => {
    if (window.confirm("Are you sure you want to permanently delete this user? This cannot be undone.")) {
      deleteUser.mutate(userId);
    }
  };

  const handleResetPassword = (userId: string) => {
    const newPwd = window.prompt("Enter the new temporary password for this user:");
    if (newPwd) {
      resetPassword.mutate({ userId, newPassword: newPwd });
    }
  };

  // THE FIX: Active Filtering Logic
  const filteredUsers = useMemo(() => {
    let list = users.data ?? [];
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((u: any) => 
        u.full_name.toLowerCase().includes(q) || 
        u.email.toLowerCase().includes(q)
      );
    }
    
    if (roleFilter) {
      list = list.filter((u: any) => u.role.code === roleFilter);
    }

    if (statusFilter) {
      const isActive = statusFilter === "active";
      list = list.filter((u: any) => u.is_active === isActive);
    }

    return list;
  }, [users.data, searchQuery, roleFilter, statusFilter]);

  return (
    <AppShell title="User Management" description="Provision system access and manage staff roles.">
      {error && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }} className="rounded-md border border-line bg-white p-6 h-fit shadow-sm">
          <div className="mb-6 flex items-center gap-2">
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
                {(hubs.data ?? []).map((hub) => (
                  <option key={hub.id} value={hub.id}>{hub.name}</option>
                ))}
              </SelectField>
            )}

            {form.role_code === "REGIONAL_MANAGER" && (
              <SelectField label="Assign Region" value={form.assigned_region} onChange={(e) => setForm({ ...form, assigned_region: e.target.value })} required>
                <option value="">Select Region...</option>
                {REGIONS.map((region) => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </SelectField>
            )}

            <div className="mt-4">
              <ActionButton disabled={createUser.isPending} type="submit" className="w-full">
                {createUser.isPending ? "Provisioning..." : "Create Account"}
              </ActionButton>
            </div>
          </div>
        </form>

        <section className="rounded-md border border-line bg-white shadow-sm h-fit overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3 bg-slate-50">
            <Users className="h-5 w-5 text-slate-600" />
            <h2 className="text-sm font-semibold text-ink">System Access Directory</h2>
          </div>

          {/* THE FIX: Filter Bar */}
          <div className="flex flex-wrap items-center gap-4 border-b border-line bg-white p-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  className="h-10 w-full rounded-md border border-line pl-9 pr-3 text-sm outline-none focus:border-brand transition-colors"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="w-full md:w-48 relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <select
                className="h-10 w-full rounded-md border border-line pl-8 pr-3 text-sm outline-none focus:border-brand bg-white"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">All Roles</option>
                <option value="MANUFACTURER">Manufacturer</option>
                <option value="WAREHOUSE_OFFICER">Warehouse Officer</option>
                <option value="DISTRIBUTION_TEAM">Distribution Team</option>
                <option value="REGIONAL_MANAGER">Regional Manager</option>
                <option value="HUB_OFFICER">Hub Officer</option>
                <option value="MANAGER">Manager</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            <div className="w-full md:w-40">
              <select
                className="h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="locked">Locked Out</option>
              </select>
            </div>
          </div>

          {/* THE FIX: Vertical Scrolling */}
          <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-panel text-xs uppercase text-slate-500 sticky top-0 z-10 shadow-sm border-b border-line">
                <tr>
                  <th className="px-4 py-3 bg-panel">Staff Member</th>
                  <th className="px-4 py-3 bg-panel">Role</th>
                  <th className="px-4 py-3 bg-panel">Status</th>
                  <th className="px-4 py-3 bg-panel text-right">Access Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredUsers.map((user: any) => (
                  <tr key={user.id} className={user.is_active ? "hover:bg-slate-50 transition-colors" : "bg-red-50/30 transition-colors"}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{user.full_name}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-brand bg-teal-50 px-2 py-1 rounded">
                        {user.role.code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={user.is_active ? "success" : "warning"}>
                        {user.is_active ? "Active" : "Locked Out"}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {user.email !== "ishmael@upenergygroup.com" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleResetPassword(user.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded transition-colors text-amber-700 bg-amber-100 hover:bg-amber-200"
                            title="Force Password Reset"
                          >
                            <Key className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => toggleAccess.mutate(user.id)}
                            disabled={toggleAccess.isPending}
                            className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded transition-colors ${
                              user.is_active
                                ? "text-amber-700 bg-amber-100 hover:bg-amber-200"
                                : "text-green-700 bg-green-100 hover:bg-green-200"
                            }`}
                          >
                            {user.is_active ? <><Ban className="h-3 w-3" /> Revoke</> : <><CheckCircle className="h-3 w-3" /> Restore</>}
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            disabled={deleteUser.isPending}
                            className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded transition-colors text-red-700 bg-red-100 hover:bg-red-200"
                            title="Permanently Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Master Account</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-500">No users match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}