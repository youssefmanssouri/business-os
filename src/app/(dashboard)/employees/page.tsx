"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { getInitials } from "@/lib/utils";
import {
  getEmployeesData,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
} from "@/lib/actions";
import {
  Users,
  Plus,
  Search,
  Mail,
  Phone,
  Shield,
  Clock,
  Play,
  Square,
  Edit2,
  RefreshCw,
  AlertCircle,
  Loader2,
  Filter,
  CheckCircle2,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  role: "ADMIN" | "MANAGER" | "EMPLOYEE";
  status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
  phone: string;
  avatar: string | null;
  createdAt: string;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState("EMPLOYEE");
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active tab & search
  const [activeTab, setActiveTab] = useState("directory");
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  // Local attendance simulator for current user
  const [myClockedIn, setMyClockedIn] = useState(true);

  // Create Employee Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Employee["role"]>("EMPLOYEE");
  const [newDept, setNewDept] = useState("Engineering");
  const [newTitle, setNewTitle] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Edit Employee Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<Employee["role"]>("EMPLOYEE");
  const [editDept, setEditDept] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editStatus, setEditStatus] = useState<Employee["status"]>("ACTIVE");
  const [editError, setEditError] = useState<string | null>(null);

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await getEmployeesData();
      if (res.success && res.employees) {
        setEmployees(res.employees);
        if (res.currentUserRole) setCurrentUserRole(res.currentUserRole);
        if (res.currentUserId) setCurrentUserId(res.currentUserId);
      } else {
        setError(res.error || "Failed to load team directory");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while loading team.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await createEmployee({
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        department: newDept.trim() || "General",
        title: newTitle.trim() || "Staff Specialist",
        phone: newPhone.trim() || undefined,
        password: newPassword.trim() || undefined,
      });

      if (res.success && res.employee) {
        setEmployees((prev) => [...prev, res.employee as Employee]);
        setIsAddOpen(false);
        setNewName("");
        setNewEmail("");
        setNewRole("EMPLOYEE");
        setNewDept("Engineering");
        setNewTitle("");
        setNewPhone("");
        setNewPassword("");
      } else {
        setFormError(res.error || "Failed to create team member");
      }
    } catch (err: any) {
      setFormError(err?.message || "Failed to create team member");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditName(emp.name);
    setEditRole(emp.role);
    setEditDept(emp.department);
    setEditTitle(emp.title);
    setEditPhone(emp.phone);
    setEditStatus(emp.status);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    setEditError(null);
    setIsSubmitting(true);

    try {
      const res = await updateEmployee({
        employeeId: editingEmployee.id,
        name: editName.trim(),
        role: editRole,
        department: editDept.trim(),
        title: editTitle.trim(),
        phone: editPhone.trim() || undefined,
        status: editStatus,
      });

      if (res.success && res.employee) {
        setEmployees((prev) =>
          prev.map((e) => (e.id === editingEmployee.id ? (res.employee as Employee) : e))
        );
        setIsEditOpen(false);
        setEditingEmployee(null);
      } else {
        setEditError(res.error || "Failed to update employee");
      }
    } catch (err: any) {
      setEditError(err?.message || "Failed to update employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusToggle = async (empId: string, currentStatus: Employee["status"]) => {
    const nextStatus: Employee["status"] = currentStatus === "ACTIVE" ? "ON_LEAVE" : "ACTIVE";
    try {
      const res = await updateEmployeeStatus(empId, nextStatus);
      if (res.success) {
        setEmployees((prev) =>
          prev.map((e) => (e.id === empId ? { ...e, status: nextStatus } : e))
        );
      } else {
        setError(res.error || "Failed to change status");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to change status");
    }
  };

  const departments = Array.from(new Set(employees.map((e) => e.department))).filter(Boolean);

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDept = departmentFilter === "ALL" || emp.department === departmentFilter;

    return matchesSearch && matchesDept;
  });

  const getRoleBadge = (role: Employee["role"]) => {
    if (role === "ADMIN") return <Badge variant="default" className="text-[10px]">ADMIN</Badge>;
    if (role === "MANAGER") return <Badge variant="warning" className="text-[10px]">MANAGER</Badge>;
    return <Badge variant="secondary" className="text-[10px]">EMPLOYEE</Badge>;
  };

  const getStatusBadge = (status: Employee["status"]) => {
    if (status === "ACTIVE") return <Badge variant="success" className="text-[10px]">ACTIVE</Badge>;
    if (status === "ON_LEAVE") return <Badge variant="secondary" className="text-[10px]">ON LEAVE</Badge>;
    return <Badge variant="destructive" className="text-[10px]">INACTIVE</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              Employee Directory & Attendance
            </h1>
            <Badge variant="outline" className="text-xs">
              {employees.length} {employees.length === 1 ? "member" : "members"}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Database-backed staff directory, organizational departments, RBAC roles, and attendance simulation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Clock In / Out Simulator Button */}
          <Button
            onClick={() => setMyClockedIn(!myClockedIn)}
            variant={myClockedIn ? "destructive" : "glow"}
            size="sm"
            className="gap-2 text-xs"
          >
            {myClockedIn ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            {myClockedIn ? "Clock Out" : "Clock In"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {(currentUserRole === "ADMIN" || currentUserRole === "MANAGER") && (
            <Button onClick={() => setIsAddOpen(true)} className="gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Add Member
            </Button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "directory", label: "Team Directory", badge: employees.length },
          { id: "attendance", label: "Live Attendance Log" },
          { id: "roles", label: "RBAC Permissions Matrix" },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Search & Department Filters */}
      {activeTab !== "roles" && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
            <Input
              placeholder="Search by name, email, department, title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-neutral-400 hidden sm:inline" />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && employees.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-5 flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-neutral-200 dark:bg-neutral-800 mb-3" />
              <div className="h-4 w-28 bg-neutral-200 dark:bg-neutral-800 rounded mb-2" />
              <div className="h-3 w-20 bg-neutral-200 dark:bg-neutral-800 rounded" />
            </Card>
          ))}
        </div>
      ) : activeTab === "directory" ? (
        /* Team Directory Grid */
        filteredEmployees.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-neutral-200 dark:border-neutral-800">
            <Users className="h-10 w-10 text-neutral-400 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
              No team members found
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
              {searchTerm || departmentFilter !== "ALL"
                ? "No employees match your search query."
                : "No staff registered in your organization yet."}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredEmployees.map((emp) => (
              <Card
                key={emp.id}
                className="p-5 flex flex-col items-center text-center relative group border-neutral-200 dark:border-neutral-800 hover:shadow-card transition-all"
              >
                {(currentUserRole === "ADMIN" || currentUserRole === "MANAGER") && (
                  <button
                    onClick={() => handleStartEdit(emp)}
                    className="absolute top-3 right-3 p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit profile"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                )}

                {emp.avatar ? (
                  <img
                    src={emp.avatar}
                    alt={emp.name}
                    className="h-16 w-16 rounded-full object-cover border-2 border-neutral-200 dark:border-neutral-700"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-neutral-100 dark:bg-neutral-800 border-2 border-neutral-200 dark:border-neutral-700 flex items-center justify-center font-bold text-neutral-700 dark:text-neutral-200 text-lg shadow-sm">
                    {getInitials(emp.name)}
                  </div>
                )}

                <h3 className="mt-3 text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  {emp.name}
                </h3>
                <p className="text-xs text-neutral-500 line-clamp-1">{emp.title}</p>

                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap justify-center">
                  {getRoleBadge(emp.role)}
                  {getStatusBadge(emp.status)}
                </div>

                <div className="mt-4 w-full pt-3 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-500 space-y-1">
                  <div className="truncate flex items-center justify-center gap-1">
                    <Mail className="h-3 w-3 text-neutral-400 shrink-0" />
                    <span className="truncate">{emp.email}</span>
                  </div>
                  <div className="font-semibold text-neutral-700 dark:text-neutral-300">
                    {emp.department}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : activeTab === "attendance" ? (
        /* Attendance Table */
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden dark:border-neutral-800 dark:bg-neutral-900">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current State</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {filteredEmployees.map((emp) => {
                const isMe = emp.id === currentUserId;
                const isOnline = isMe ? myClockedIn : emp.status === "ACTIVE";

                return (
                  <TableRow key={emp.id}>
                    <TableCell className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2.5">
                      {emp.avatar ? (
                        <img src={emp.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-700 dark:text-neutral-300">
                          {getInitials(emp.name)}
                        </div>
                      )}
                      <div>
                        <span>{emp.name}</span>
                        {isMe && <span className="ml-1.5 text-[10px] text-blue-500 font-normal">(You)</span>}
                      </div>
                    </TableCell>
                    <TableCell>{emp.department}</TableCell>
                    <TableCell>{getRoleBadge(emp.role)}</TableCell>
                    <TableCell>{getStatusBadge(emp.status)}</TableCell>
                    <TableCell>
                      <Badge variant={isOnline ? "success" : "secondary"} className="text-[10px]">
                        {isOnline ? "CLOCKED IN" : "OFFLINE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {(currentUserRole === "ADMIN" || currentUserRole === "MANAGER") && (
                        <Button
                          onClick={() => handleStatusToggle(emp.id, emp.status)}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                        >
                          {emp.status === "ACTIVE" ? "Set Leave" : "Set Active"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        </div>
      ) : (
        /* RBAC Permissions Matrix View */
        <Card className="p-6 space-y-4 border-neutral-200 dark:border-neutral-800">
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" />
              Role-Based Access Control (RBAC) Architecture
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Strict multi-tenant authorization boundaries enforced server-side on every Server Action.
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 overflow-hidden dark:border-neutral-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Functional Domain</TableHead>
                  <TableHead>ADMIN Role</TableHead>
                  <TableHead>MANAGER Role</TableHead>
                  <TableHead>EMPLOYEE Role</TableHead>
                </TableRow>
              </TableHeader>
              <tbody>
                <TableRow>
                  <TableCell className="font-bold">Invoices & Financials</TableCell>
                  <TableCell><Badge variant="success">Full Access (Create / Edit / Void / Settle)</Badge></TableCell>
                  <TableCell><Badge variant="success">Full Access (Create / Edit / Settle)</Badge></TableCell>
                  <TableCell><Badge variant="secondary">Read-Only</Badge></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-bold">CRM & Deals</TableCell>
                  <TableCell><Badge variant="success">Full Access</Badge></TableCell>
                  <TableCell><Badge variant="success">Full Access</Badge></TableCell>
                  <TableCell><Badge variant="secondary">Read & Status Progression</Badge></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-bold">Inventory & Vault</TableCell>
                  <TableCell><Badge variant="success">Full Access (Create / Edit / Delete)</Badge></TableCell>
                  <TableCell><Badge variant="success">Full Access (Create / Edit / Delete)</Badge></TableCell>
                  <TableCell><Badge variant="secondary">Read-Only</Badge></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-bold">Tasks & Workflows</TableCell>
                  <TableCell><Badge variant="success">Full Access</Badge></TableCell>
                  <TableCell><Badge variant="success">Full Access</Badge></TableCell>
                  <TableCell><Badge variant="secondary">Create & Status Updates (Delete Restricted)</Badge></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-bold">Team Directory</TableCell>
                  <TableCell><Badge variant="success">Full Access (Create / Edit / Status)</Badge></TableCell>
                  <TableCell><Badge variant="warning">Edit Staff (Cannot Modify Admins)</Badge></TableCell>
                  <TableCell><Badge variant="secondary">Directory Read-Only</Badge></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-bold">Company Settings & Profile</TableCell>
                  <TableCell><Badge variant="success">Full Access (Exclusive)</Badge></TableCell>
                  <TableCell><Badge variant="destructive">Forbidden (403)</Badge></TableCell>
                  <TableCell><Badge variant="destructive">Forbidden (403)</Badge></TableCell>
                </TableRow>
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {/* Add Employee Modal */}
      <Dialog
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setFormError(null);
        }}
        title="Add Team Member"
        description="Invite an employee or administrator to your organization's workspace."
      >
        <form onSubmit={handleAddEmployee} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Full Name <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Elena Rostova"
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Email Address <span className="text-red-500">*</span>
              </label>
              <Input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="elena@company.com"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                RBAC Role <span className="text-red-500">*</span>
              </label>
              <select
                value={newRole}
                onChange={(e: any) => setNewRole(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-xs text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="EMPLOYEE">Employee (Standard Access)</option>
                <option value="MANAGER">Manager (Team Operations)</option>
                {currentUserRole === "ADMIN" && (
                  <option value="ADMIN">Administrator (Full Access)</option>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Department
              </label>
              <Input
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                placeholder="Engineering, Sales, Operations..."
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Job Title
              </label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Senior Platform Architect"
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Phone Number
              </label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+1 (555) 019-2834"
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Temporary Password
              </label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Member
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Employee Modal */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingEmployee(null);
          setEditError(null);
        }}
        title="Edit Team Member"
        description={editingEmployee ? `Update profile details for ${editingEmployee.name}` : "Update profile"}
      >
        <form onSubmit={handleUpdateEmployee} className="space-y-4">
          {editError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {editError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Full Name
            </label>
            <Input
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Department
              </label>
              <Input
                value={editDept}
                onChange={(e) => setEditDept(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Job Title
              </label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Phone
              </label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Status
              </label>
              <select
                value={editStatus}
                onChange={(e: any) => setEditStatus(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-xs text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="ON_LEAVE">ON LEAVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          {currentUserRole === "ADMIN" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Role
              </label>
              <select
                value={editRole}
                onChange={(e: any) => setEditRole(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-xs text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditOpen(false);
                setEditingEmployee(null);
                setEditError(null);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
