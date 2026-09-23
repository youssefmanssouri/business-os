"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  createNewTask,
  updateTaskStatus,
  deleteTask,
  getTasksData,
} from "@/lib/actions";
import {
  Plus,
  Search,
  Clock,
  User as UserIcon,
  Tag,
  Trash2,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Filter,
} from "lucide-react";

interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assigneeId: string | null;
  assigneeName: string;
  assigneeAvatar: string | null;
  dueDate: string | null;
  tags: string;
  createdAt: string;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  role: string;
}

const columns: { id: TaskItem["status"]; label: string; color: string }[] = [
  { id: "TODO", label: "To Do", color: "bg-neutral-400" },
  { id: "IN_PROGRESS", label: "In Progress", color: "bg-blue-500" },
  { id: "REVIEW", label: "In Review", color: "bg-amber-500" },
  { id: "DONE", label: "Completed", color: "bg-emerald-500" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");

  // Create Task Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskItem["priority"]>("HIGH");
  const [taskStatus, setTaskStatus] = useState<TaskItem["status"]>("TODO");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskTags, setTaskTags] = useState("Engineering");

  // Delete Modal State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch tasks and staff from database
  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await getTasksData();
      if (res.success && res.tasks) {
        setTasks(res.tasks);
        setStaff(res.staff || []);
      } else {
        setError(res.error || "Failed to load tasks");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while fetching tasks.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Move task status forward/backward
  const moveTask = async (taskId: string, direction: "next" | "prev") => {
    const order: TaskItem["status"][] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const currIndex = order.indexOf(task.status);
    const nextIndex =
      direction === "next"
        ? Math.min(currIndex + 1, order.length - 1)
        : Math.max(currIndex - 1, 0);

    const nextStatus = order[nextIndex];
    if (nextStatus === task.status) return;

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t))
    );

    try {
      const res = await updateTaskStatus(taskId, nextStatus);
      if (res.success && res.task) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? (res.task as TaskItem) : t))
        );
        window.dispatchEvent(new Event("task-updated"));
      } else {
        // Revert on failure
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? task : t))
        );
        setError(res.error || "Failed to update task status");
      }
    } catch (err: any) {
      // Revert on failure
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? task : t))
      );
      setError(err?.message || "Error updating task status");
    }
  };

  // Create Task Handler
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await createNewTask({
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        priority: taskPriority,
        status: taskStatus,
        assigneeId: taskAssigneeId || undefined,
        dueDate: taskDueDate || undefined,
        tags: taskTags.trim() || "General",
      });

      if (res.success && res.task) {
        setTasks((prev) => [res.task as TaskItem, ...prev]);
        setIsAddOpen(false);
        setTaskTitle("");
        setTaskDesc("");
        setTaskPriority("HIGH");
        setTaskStatus("TODO");
        setTaskAssigneeId("");
        setTaskDueDate("");
        setTaskTags("Engineering");
        window.dispatchEvent(new Event("task-updated"));
      } else {
        setFormError(res.error || "Failed to create task");
      }
    } catch (err: any) {
      setFormError(err?.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Task Handler
  const confirmDelete = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteTask(taskToDelete.id);
      if (res.success) {
        setTasks((prev) => prev.filter((t) => t.id !== taskToDelete.id));
        setIsDeleteOpen(false);
        setTaskToDelete(null);
        window.dispatchEvent(new Event("task-updated"));
      } else {
        setDeleteError(res.error || "Failed to delete task.");
      }
    } catch (err: any) {
      setDeleteError(err?.message || "An error occurred while deleting task.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tags.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.assigneeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPriority =
      priorityFilter === "ALL" || t.priority === priorityFilter;

    return matchesSearch && matchesPriority;
  });

  const getPriorityBadge = (priority: TaskItem["priority"]) => {
    if (priority === "URGENT") return <Badge variant="destructive">URGENT</Badge>;
    if (priority === "HIGH") return <Badge variant="warning">HIGH</Badge>;
    if (priority === "MEDIUM") return <Badge variant="secondary">MEDIUM</Badge>;
    return <Badge variant="outline">LOW</Badge>;
  };

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              Tasks & Workflows
            </h1>
            <Badge variant="outline" className="text-xs">
              {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Database-backed task management with assignee verification, priority tracking, and tenant isolation.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button onClick={() => setIsAddOpen(true)} className="gap-2" size="sm">
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Filter tasks by title, tags, assignee..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-neutral-400 hidden sm:inline" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && tasks.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {columns.map((col) => (
            <div
              key={col.id}
              className="flex flex-col rounded-2xl border border-neutral-200/80 bg-neutral-50/70 p-3 dark:border-neutral-800/80 dark:bg-neutral-900/40 min-h-[300px] animate-pulse"
            >
              <div className="h-5 w-24 bg-neutral-200 dark:bg-neutral-800 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-24 bg-neutral-200 dark:bg-neutral-800 rounded-xl" />
                <div className="h-24 bg-neutral-200 dark:bg-neutral-800 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Kanban Board Grid */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 overflow-x-auto pb-4">
          {columns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.id);

            return (
              <div
                key={col.id}
                className="flex flex-col rounded-2xl border border-neutral-200/80 bg-neutral-50/70 p-3 dark:border-neutral-800/80 dark:bg-neutral-900/40 min-w-[260px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 border-b border-neutral-200/60 dark:border-neutral-800/60">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                    <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                      {col.label}
                    </span>
                    <span className="rounded-full bg-neutral-200/70 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      {colTasks.length}
                    </span>
                  </div>
                </div>

                {/* Task Cards */}
                <div className="mt-3 space-y-3 flex-1 overflow-y-auto max-h-[650px]">
                  {colTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-xs text-neutral-400 dark:border-neutral-800">
                      No tasks in this column
                    </div>
                  ) : (
                    colTasks.map((task) => (
                      <Card
                        key={task.id}
                        className="p-4 hover:shadow-card transition-all border-neutral-200 dark:border-neutral-800 relative group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                            {task.title}
                          </span>
                          <div className="shrink-0">{getPriorityBadge(task.priority)}</div>
                        </div>

                        {task.description && (
                          <p className="mt-1.5 text-[11px] text-neutral-500 line-clamp-2 leading-relaxed">
                            {task.description}
                          </p>
                        )}

                        <div className="mt-3 space-y-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-800/60 text-[10px] text-neutral-500 dark:text-neutral-400">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Tag className="h-3 w-3 text-neutral-400" />
                              <span className="truncate max-w-[120px]">{task.tags}</span>
                            </span>
                            {task.dueDate && (
                              <span className="flex items-center gap-1 text-neutral-400">
                                <Clock className="h-3 w-3" />
                                {formatDueDate(task.dueDate)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-medium text-neutral-700 dark:text-neutral-300">
                              <UserIcon className="h-3 w-3 text-neutral-400" />
                              <span className="truncate max-w-[140px]">{task.assigneeName}</span>
                            </span>

                            {/* Delete trigger */}
                            <button
                              onClick={() => {
                                setTaskToDelete(task);
                                setDeleteError(null);
                                setIsDeleteOpen(true);
                              }}
                              className="text-neutral-400 hover:text-red-600 transition-colors p-1 rounded"
                              title="Delete task"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Column Shift Buttons */}
                        <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/50 flex items-center justify-between gap-1">
                          <button
                            onClick={() => moveTask(task.id, "prev")}
                            disabled={task.status === "TODO"}
                            className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[10px] font-medium disabled:opacity-30 disabled:pointer-events-none transition-colors"
                          >
                            &larr; Prev
                          </button>
                          <button
                            onClick={() => moveTask(task.id, "next")}
                            disabled={task.status === "DONE"}
                            className="px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[10px] font-medium disabled:opacity-30 disabled:pointer-events-none transition-colors"
                          >
                            Next &rarr;
                          </button>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Task Modal */}
      <Dialog
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setFormError(null);
        }}
        title="Create New Task"
        description="Add a persistent task to your organization's workflow board."
      >
        <form onSubmit={handleAddTask} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Task Title <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Implement Multi-Tenant Storage Adapter"
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Description
            </label>
            <Input
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="Detailed acceptance criteria or implementation plan..."
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Priority
              </label>
              <select
                value={taskPriority}
                onChange={(e: any) => setTaskPriority(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-xs text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Initial Status
              </label>
              <select
                value={taskStatus}
                onChange={(e: any) => setTaskStatus(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-xs text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="REVIEW">In Review</option>
                <option value="DONE">Completed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Assignee
              </label>
              <select
                value={taskAssigneeId}
                onChange={(e) => setTaskAssigneeId(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-xs text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">Current User (Default)</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Due Date
              </label>
              <Input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Tags
            </label>
            <Input
              value={taskTags}
              onChange={(e) => setTaskTags(e.target.value)}
              placeholder="e.g. Backend, Security, Sprint 4"
              className="text-xs"
            />
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
              Create Task
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setTaskToDelete(null);
          setDeleteError(null);
        }}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
      >
        <div className="space-y-4">
          {deleteError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {deleteError}
            </div>
          )}

          {taskToDelete && (
            <div className="rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800/50 space-y-1 border border-neutral-200/60 dark:border-neutral-700/60">
              <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                {taskToDelete.title}
              </div>
              <div className="text-neutral-500">
                Status: {taskToDelete.status} | Priority: {taskToDelete.priority}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsDeleteOpen(false);
                setTaskToDelete(null);
                setDeleteError(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
