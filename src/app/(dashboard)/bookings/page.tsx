"use client";

import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import {
  getTodayInTimezone,
  getWeekDaysInTimezone,
  formatAppointmentInterval,
  formatAppointmentTime,
  getAppointmentLocalDateStr,
  parseCompanyDateTime,
} from "@/lib/timezone";
import {
  getBookingsData,
  createAppointment,
  rescheduleAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  createService,
  updateService,
} from "@/lib/actions";
import {
  Clock,
  Plus,
  User,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CheckCircle2,
  X,
  Briefcase,
  Globe,
} from "lucide-react";

export interface ServiceRecord {
  id: string;
  title: string;
  description?: string | null;
  durationMinutes: number;
  price: number;
  category: string;
  isActive: boolean;
}

export interface CustomerRecord {
  id: string;
  name: string;
  companyName?: string | null;
  email: string;
}

export interface StaffRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
}

export interface AppointmentRecord {
  id: string;
  companyId: string;
  customerId: string;
  customer: CustomerRecord;
  serviceId: string;
  service: ServiceRecord;
  staffId?: string | null;
  staff?: StaffRecord | null;
  startTime: string | Date;
  endTime: string | Date;
  status: "CONFIRMED" | "COMPLETED" | "CANCELLED";
  notes?: string | null;
}

export interface CompanySummary {
  id: string;
  name: string;
  timezone: string;
  currency: string;
}

export default function BookingsPage() {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [company, setCompany] = useState<CompanySummary>({
    id: "",
    name: "Organization",
    timezone: "America/New_York",
    currency: "USD",
  });

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [viewMode, setViewMode] = useState<"calendar" | "services">("calendar");

  // Calendar Date Navigation
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedDayIndex, setSelectedDayIndex] = useState(0); // for mobile day-selector

  // Modals
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isEditServiceModalOpen, setIsEditServiceModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRecord | null>(null);
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleNotes, setRescheduleNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Booking Form State
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formServiceId, setFormServiceId] = useState("");
  const [formStaffId, setFormStaffId] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("10:00");
  const [formNotes, setFormNotes] = useState("");

  // Service Creation Form State
  const [serviceTitle, setServiceTitle] = useState("");
  const [serviceDesc, setServiceDesc] = useState("");
  const [serviceDuration, setServiceDuration] = useState("60");
  const [servicePrice, setServicePrice] = useState("150");
  const [serviceCategory, setServiceCategory] = useState("Consulting");

  // Service Edit Form State
  const [editingService, setEditingService] = useState<ServiceRecord | null>(null);
  const [editServiceTitle, setEditServiceTitle] = useState("");
  const [editServiceDesc, setEditServiceDesc] = useState("");
  const [editServiceDuration, setEditServiceDuration] = useState("60");
  const [editServicePrice, setEditServicePrice] = useState("150");
  const [editServiceCategory, setEditServiceCategory] = useState("Consulting");

  // Load Data on Mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await getBookingsData();
        if (res.success) {
          setAppointments((res.appointments as any) || []);
          setServices((res.services as any) || []);
          setCustomers((res.customers as any) || []);
          setStaff((res.staff as any) || []);
          if (res.company) setCompany(res.company as any);
        } else {
          setFeedback({ type: "error", message: res.error || "Failed to load bookings data" });
        }
      } catch (err: any) {
        setFeedback({ type: "error", message: err?.message || "Connection error" });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Auto-dismiss feedback
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Active services for scheduling
  const activeServices = services.filter((s) => s.isActive);

  // Calculate Week Days from calendarDate in authoritative company timezone
  const weekDays = getWeekDaysInTimezone(calendarDate, company.timezone);
  const todayDateStr = getTodayInTimezone(company.timezone);

  // Navigate Calendar
  const handlePrevWeek = () => {
    const d = new Date(calendarDate);
    d.setDate(d.getDate() - 7);
    setCalendarDate(d);
  };

  const handleNextWeek = () => {
    const d = new Date(calendarDate);
    d.setDate(d.getDate() + 7);
    setCalendarDate(d);
  };

  const handleToday = () => {
    setCalendarDate(new Date());
  };

  // Open Booking Modal
  const handleOpenBookModal = (preselectedServiceId?: string, targetDateStr?: string) => {
    setFormCustomerId(customers[0]?.id || "");
    setFormServiceId(preselectedServiceId || activeServices[0]?.id || "");
    setFormStaffId(staff[0]?.id || "");
    setFormDate(targetDateStr || getTodayInTimezone(company.timezone));
    setFormTime("10:00");
    setFormNotes("");
    setIsBookModalOpen(true);
  };

  // Selected Service in Form for duration & price display
  const activeFormService = activeServices.find((s) => s.id === formServiceId) || activeServices[0];

  // Calculated End Time Display in company timezone
  const getCalculatedEndTime = () => {
    if (!formDate || !formTime || !activeFormService) return "";
    try {
      const startUtc = parseCompanyDateTime(formDate, formTime, company.timezone);
      const endUtc = new Date(startUtc.getTime() + activeFormService.durationMinutes * 60000);
      return formatAppointmentTime(endUtc, company.timezone, "HH:mm");
    } catch {
      return "";
    }
  };

  // Submit New Booking
  const handleCreateBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerId) {
      setFeedback({ type: "error", message: "Please select a customer." });
      return;
    }
    if (!formServiceId) {
      setFeedback({ type: "error", message: "Please select a service." });
      return;
    }
    if (!formDate || !formTime) {
      setFeedback({ type: "error", message: "Please specify appointment date and time." });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createAppointment({
        customerId: formCustomerId,
        serviceId: formServiceId,
        staffId: formStaffId || null,
        date: formDate,
        time: formTime,
        startTime: `${formDate}T${formTime}`,
        notes: formNotes || "",
      });

      if (res.success && res.appointment) {
        setAppointments((prev) => [...prev, res.appointment as any]);
        setIsBookModalOpen(false);
        setFeedback({
          type: "success",
          message: `Appointment successfully scheduled with ${(res.appointment as any).customer?.name}.`,
        });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to schedule appointment." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Unexpected server error." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit New Service
  const handleCreateServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await createService({
        title: serviceTitle,
        description: serviceDesc,
        durationMinutes: parseInt(serviceDuration, 10) || 60,
        price: parseFloat(servicePrice) || 0,
        category: serviceCategory || "General",
      });

      if (res.success && res.service) {
        setServices((prev) => [...prev, res.service as any]);
        setIsServiceModalOpen(false);
        setServiceTitle("");
        setServiceDesc("");
        setServiceDuration("60");
        setServicePrice("150");
        setFeedback({ type: "success", message: `Service "${(res.service as any).title}" added to catalog.` });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to add service." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Unexpected error." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Service Modal
  const handleOpenEditServiceModal = (srv: ServiceRecord) => {
    setEditingService(srv);
    setEditServiceTitle(srv.title);
    setEditServiceDesc(srv.description || "");
    setEditServiceDuration(String(srv.durationMinutes));
    setEditServicePrice(String(srv.price));
    setEditServiceCategory(srv.category || "Consulting");
    setIsEditServiceModalOpen(true);
  };

  // Submit Edit Service
  const handleEditServiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;
    setIsSubmitting(true);
    try {
      const res = await updateService({
        serviceId: editingService.id,
        title: editServiceTitle,
        description: editServiceDesc,
        durationMinutes: parseInt(editServiceDuration, 10) || 60,
        price: parseFloat(editServicePrice) || 0,
        category: editServiceCategory || "Consulting",
      });

      if (res.success && res.service) {
        setServices((prev) =>
          prev.map((s) => (s.id === editingService.id ? (res.service as any) : s))
        );
        setIsEditServiceModalOpen(false);
        setEditingService(null);
        setFeedback({ type: "success", message: `Service "${(res.service as any).title}" updated.` });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update service." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Unexpected error." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Service Active / Inactive
  const handleToggleServiceActive = async (srv: ServiceRecord) => {
    setIsSubmitting(true);
    try {
      const res = await updateService({
        serviceId: srv.id,
        isActive: !srv.isActive,
      });

      if (res.success && res.service) {
        setServices((prev) =>
          prev.map((s) => (s.id === srv.id ? (res.service as any) : s))
        );
        setFeedback({
          type: "success",
          message: `Service "${srv.title}" ${!srv.isActive ? "reactivated" : "deactivated"}.`,
        });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update service status." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Unexpected error." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update Status Action
  const handleStatusUpdate = async (newStatus: "CONFIRMED" | "COMPLETED" | "CANCELLED") => {
    if (!selectedAppointment) return;
    setIsSubmitting(true);
    try {
      const res = await updateAppointmentStatus({
        appointmentId: selectedAppointment.id,
        status: newStatus,
      });

      if (res.success && res.appointment) {
        setAppointments((prev) =>
          prev.map((a) => (a.id === selectedAppointment.id ? (res.appointment as any) : a))
        );
        setSelectedAppointment(res.appointment as any);
        setFeedback({
          type: "success",
          message: `Appointment status updated to ${newStatus}.`,
        });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update appointment status." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Unexpected error." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Appointment Action
  const handleDeleteAppointment = async () => {
    if (!selectedAppointment) return;
    setIsSubmitting(true);
    try {
      const res = await deleteAppointment(selectedAppointment.id);
      if (res.success) {
        setAppointments((prev) => prev.filter((a) => a.id !== selectedAppointment.id));
        setSelectedAppointment(null);
        setFeedback({ type: "success", message: "Appointment deleted successfully." });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to delete appointment." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Unexpected error." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Reschedule Modal
  const handleOpenRescheduleModal = () => {
    if (!selectedAppointment || selectedAppointment.status !== "CONFIRMED") return;
    const localDate = getAppointmentLocalDateStr(selectedAppointment.startTime, company.timezone);
    const localTime = formatAppointmentTime(selectedAppointment.startTime, company.timezone, "HH:mm");
    setRescheduleDate(localDate);
    setRescheduleTime(localTime);
    setRescheduleNotes(selectedAppointment.notes || "");
    setIsRescheduleModalOpen(true);
  };

  // Calculated End Time for Reschedule
  const getCalculatedRescheduleEndTime = () => {
    if (!rescheduleDate || !rescheduleTime || !selectedAppointment?.service) return "";
    try {
      const startUtc = parseCompanyDateTime(rescheduleDate, rescheduleTime, company.timezone);
      const endUtc = new Date(startUtc.getTime() + selectedAppointment.service.durationMinutes * 60000);
      return formatAppointmentTime(endUtc, company.timezone, "HH:mm");
    } catch {
      return "";
    }
  };

  // Submit Reschedule
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment || !rescheduleDate || !rescheduleTime) {
      setFeedback({ type: "error", message: "Please specify new date and time." });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await rescheduleAppointment({
        appointmentId: selectedAppointment.id,
        date: rescheduleDate,
        time: rescheduleTime,
        startTime: `${rescheduleDate}T${rescheduleTime}`,
        notes: rescheduleNotes,
      });

      if (res.success && res.appointment) {
        setAppointments((prev) =>
          prev.map((a) => (a.id === selectedAppointment.id ? (res.appointment as any) : a))
        );
        setSelectedAppointment(res.appointment as any);
        setIsRescheduleModalOpen(false);
        setFeedback({
          type: "success",
          message: `Appointment successfully rescheduled to ${rescheduleDate} at ${rescheduleTime}.`,
        });
      } else {
        setFeedback({
          type: "error",
          message: res.error || "This time slot is no longer available. Please choose a different slot.",
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Unexpected error while rescheduling." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: AppointmentRecord["status"]) => {
    switch (status) {
      case "COMPLETED":
        return <Badge variant="success">COMPLETED</Badge>;
      case "CANCELLED":
        return <Badge variant="destructive">CANCELLED</Badge>;
      case "CONFIRMED":
      default:
        return <Badge variant="default">CONFIRMED</Badge>;
    }
  };

  // Filter appointments for the active week using company timezone
  const weekStartStr = weekDays[0].dateStr;
  const weekEndStr = weekDays[6].dateStr;
  const weekAppointments = appointments.filter((apt) => {
    const aptDateStr = getAppointmentLocalDateStr(apt.startTime, company.timezone);
    return aptDateStr >= weekStartStr && aptDateStr <= weekEndStr;
  });

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Bookings & Calendar
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex items-center gap-1.5">
            <span>Manage service catalog and client appointments for {company.name}.</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-neutral-800 font-mono text-[10px] text-neutral-600 dark:text-neutral-300">
              <Globe className="h-3 w-3" />
              {company.timezone}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs
            tabs={[
              { id: "calendar", label: "Calendar Schedule" },
              { id: "services", label: "Service Catalog" },
            ]}
            activeTab={viewMode}
            onChange={(v: any) => setViewMode(v)}
          />
          {viewMode === "calendar" ? (
            <Button onClick={() => handleOpenBookModal()} className="gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Schedule Booking
            </Button>
          ) : (
            <Button onClick={() => setIsServiceModalOpen(true)} className="gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Add Service
            </Button>
          )}
        </div>
      </div>

      {/* Calendar View Mode */}
      {viewMode === "calendar" ? (
        <div className="space-y-6">
          {/* Calendar Header Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white p-4 dark:border-neutral-800/80 dark:bg-neutral-900 shadow-subtle">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                {weekDays[0].formattedDate} – {weekDays[6].formattedDate}
              </span>
              <Badge variant="secondary" className="text-xs">
                {weekAppointments.length} {weekAppointments.length === 1 ? "Session" : "Sessions"}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5"
                onClick={handlePrevWeek}
                title="Previous Week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={handleToday}
              >
                Current Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5"
                onClick={handleNextWeek}
                title="Next Week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Loading Skeletons */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-2xl" />
              ))}
            </div>
          ) : (
            <>
              {/* Desktop 7-Day Grid View (hidden on small screens) */}
              <div className="hidden md:grid md:grid-cols-7 gap-3">
                {weekDays.map((day) => {
                  const dayBookings = appointments.filter((b) => {
                    return getAppointmentLocalDateStr(b.startTime, company.timezone) === day.dateStr;
                  });

                  const isToday = day.dateStr === todayDateStr;

                  return (
                    <div
                      key={day.dateStr}
                      className={`flex flex-col rounded-2xl border p-3 min-h-[260px] transition-all ${
                        isToday
                          ? "border-neutral-900 bg-neutral-50/70 dark:border-neutral-400 dark:bg-neutral-800/40"
                          : "border-neutral-200/80 bg-white dark:border-neutral-800/80 dark:bg-neutral-900"
                      }`}
                    >
                      {/* Day Header */}
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
                        <div>
                          <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                            {day.dayName}
                          </div>
                          <div className="text-[11px] text-neutral-400">
                            {day.formattedDate}
                          </div>
                        </div>
                        {isToday && (
                          <span className="h-2 w-2 rounded-full bg-emerald-500" title="Today in company timezone" />
                        )}
                      </div>

                      {/* Day Appointments List */}
                      <div className="mt-2 space-y-2 flex-1">
                        {dayBookings.length === 0 ? (
                          <div className="text-[11px] text-neutral-400 italic pt-2 text-center">
                            No sessions
                          </div>
                        ) : (
                          dayBookings.map((b) => (
                            <button
                              type="button"
                              key={b.id}
                              onClick={() => setSelectedAppointment(b)}
                              aria-label={`${b.service?.title || "Service"} for ${b.customer?.name || "Client"}, ${formatAppointmentInterval(b.startTime, b.endTime, company.timezone)}, status ${b.status}`}
                              className={`w-full text-left rounded-xl border p-2 text-xs transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-neutral-100 cursor-pointer ${
                                b.status === "COMPLETED"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-300"
                                  : b.status === "CANCELLED"
                                  ? "border-neutral-300 bg-neutral-100 text-neutral-500 line-through dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400"
                                  : "border-blue-500/30 bg-blue-500/10 text-blue-950 dark:text-blue-200"
                              }`}
                            >
                              <div className="font-bold truncate">{b.service?.title || "Service"}</div>
                              <div className="text-[10px] opacity-80 mt-0.5 truncate">
                                {b.customer?.name || "Client"}
                              </div>
                              <div className="text-[10px] font-semibold mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" />
                                {formatAppointmentInterval(b.startTime, b.endTime, company.timezone)}
                              </div>
                              {b.staff && (
                                <div className="text-[10px] opacity-75 mt-0.5 flex items-center gap-1 truncate">
                                  <User className="h-2.5 w-2.5 shrink-0" />
                                  {b.staff.name}
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenBookModal(undefined, day.dateStr)}
                        className="mt-2 h-7 w-full text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Book Slot
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Mobile Single-Day Agenda View */}
              <div className="md:hidden space-y-4">
                {/* Mobile Day Selector Tabs */}
                <div className="flex gap-1.5 overflow-x-auto pb-2 border-b border-neutral-200 dark:border-neutral-800">
                  {weekDays.map((day, idx) => {
                    const isSelected = selectedDayIndex === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedDayIndex(idx)}
                        className={`flex-1 min-w-[50px] p-2 rounded-xl text-center text-xs transition-all ${
                          isSelected
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold shadow"
                            : "bg-white text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800"
                        }`}
                      >
                        <div>{day.dayName}</div>
                        <div className="text-sm font-semibold">{day.dayOfMonth}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Mobile Agenda for Selected Day */}
                {(() => {
                  const day = weekDays[selectedDayIndex];
                  const dayBookings = appointments.filter((b) => {
                    return getAppointmentLocalDateStr(b.startTime, company.timezone) === day.dateStr;
                  });

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                          {day.fullDayName}, {day.formattedDate}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenBookModal(undefined, day.dateStr)}
                          className="h-8 text-xs gap-1"
                        >
                          <Plus className="h-3.5 w-3.5" /> Book
                        </Button>
                      </div>

                      {dayBookings.length === 0 ? (
                        <div className="p-8 text-center rounded-xl border border-dashed border-neutral-300 dark:border-neutral-800 text-neutral-400 text-xs">
                          No appointments scheduled for this date.
                        </div>
                      ) : (
                        dayBookings.map((b) => (
                          <button
                            type="button"
                            key={b.id}
                            onClick={() => setSelectedAppointment(b)}
                            aria-label={`${b.service?.title || "Service"} for ${b.customer?.name || "Client"}, ${formatAppointmentInterval(b.startTime, b.endTime, company.timezone)}, status ${b.status}`}
                            className="w-full text-left p-3.5 rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 shadow-sm space-y-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-neutral-100 cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                                {b.service?.title}
                              </span>
                              {getStatusBadge(b.status)}
                            </div>
                            <div className="text-xs text-neutral-600 dark:text-neutral-400">
                              Client: <span className="font-semibold">{b.customer?.name}</span>
                              {b.customer?.companyName && ` (${b.customer.companyName})`}
                            </div>
                            <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              {formatAppointmentInterval(b.startTime, b.endTime, company.timezone)}
                            </div>
                            {b.staff && (
                              <div className="text-xs text-neutral-500 flex items-center gap-1">
                                <User className="h-3 w-3 shrink-0" /> Staff: {b.staff.name}
                              </div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Service Catalog View Mode */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                Service Offerings ({services.length})
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Configure services, pricing, and active status for client bookings.
              </p>
            </div>
            <Button onClick={() => setIsServiceModalOpen(true)} className="gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Add Service
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : services.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="h-6 w-6" />}
              title="No services configured"
              description="Add your company's consulting, development, or service offerings to enable client scheduling."
              actionLabel="Add Service"
              onAction={() => setIsServiceModalOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {services.map((srv) => (
                <Card key={srv.id} className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {srv.category || "Consulting"}
                        </Badge>
                        {srv.isActive ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            Inactive
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-neutral-500">
                        <Clock className="h-3.5 w-3.5 inline mr-1" />
                        {srv.durationMinutes} mins
                      </span>
                    </div>
                    <h3 className={`mt-3 text-base font-bold text-neutral-900 dark:text-neutral-100 ${!srv.isActive ? "opacity-60" : ""}`}>
                      {srv.title}
                    </h3>
                    {srv.description && (
                      <p className="mt-1.5 text-xs text-neutral-500 line-clamp-2">
                        {srv.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-5 border-t border-neutral-100 pt-3 dark:border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(srv.price, company.currency)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEditServiceModal(srv)}
                          className="text-xs h-8"
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleServiceActive(srv)}
                          disabled={isSubmitting}
                          className={`text-xs h-8 ${srv.isActive ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"}`}
                        >
                          {srv.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                    {srv.isActive ? (
                      <Button
                        size="sm"
                        onClick={() => handleOpenBookModal(srv.id)}
                        className="w-full text-xs h-8"
                      >
                        Book Service
                      </Button>
                    ) : (
                      <div className="text-[11px] text-neutral-400 text-center py-1 italic">
                        Inactive for new bookings
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Client Booking Dialog */}
      <Dialog
        isOpen={isBookModalOpen}
        onClose={() => setIsBookModalOpen(false)}
        title="Schedule Client Appointment"
        description={`Book a session with automatic duration and conflict checks in ${company.timezone}.`}
        maxWidth="xl"
      >
        <form onSubmit={handleCreateBookingSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Customer *
            </label>
            {customers.length === 0 ? (
              <div className="text-xs text-amber-600 dark:text-amber-400 p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                No active CRM customers found. Please add a customer in the CRM first.
              </div>
            ) : (
              <select
                required
                value={formCustomerId}
                onChange={(e) => setFormCustomerId(e.target.value)}
                className="w-full text-sm rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.companyName ? `(${c.companyName})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Service *
              </label>
              <select
                required
                value={formServiceId}
                onChange={(e) => setFormServiceId(e.target.value)}
                className="w-full text-sm rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                {activeServices.length === 0 ? (
                  <option value="">No active services available</option>
                ) : (
                  activeServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.durationMinutes}m – {formatCurrency(s.price, company.currency)})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Assign Staff
              </label>
              <select
                value={formStaffId}
                onChange={(e) => setFormStaffId(e.target.value)}
                className="w-full text-sm rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">Unassigned</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Date *
              </label>
              <Input
                type="date"
                required
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Start Time *
              </label>
              <Input
                type="time"
                required
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
              />
            </div>
          </div>

          {/* Timezone Indicator & Dynamic Summary Preview */}
          <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
              <Globe className="h-3.5 w-3.5 text-neutral-600 dark:text-neutral-300 shrink-0" />
              <span>
                Operating in company timezone: <strong className="text-neutral-800 dark:text-neutral-200">{company.timezone}</strong>
              </span>
            </div>
            {activeFormService && formDate && formTime && (
              <div className="pt-1.5 border-t border-neutral-200/60 dark:border-neutral-800 space-y-1">
                <div className="font-semibold text-neutral-700 dark:text-neutral-300 flex justify-between">
                  <span>Calculated Slot:</span>
                  <span className="text-neutral-900 dark:text-neutral-100 font-bold">
                    {formTime} – {getCalculatedEndTime()} ({activeFormService.durationMinutes} mins)
                  </span>
                </div>
                <div className="text-neutral-500 flex justify-between">
                  <span>Service Price:</span>
                  <span>{formatCurrency(activeFormService.price, company.currency)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Session Notes
            </label>
            <Input
              placeholder="e.g. Scope review for enterprise deployment..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsBookModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || customers.length === 0 || activeServices.length === 0}
            >
              {isSubmitting ? "Scheduling..." : "Confirm & Schedule"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Appointment Details & Actions Modal */}
      {selectedAppointment && (
        <Dialog
          isOpen={!!selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          title="Appointment Details"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <div>
                <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                  {selectedAppointment.service?.title}
                </h3>
                <p className="text-neutral-500">{selectedAppointment.service?.category}</p>
              </div>
              <div>{getStatusBadge(selectedAppointment.status)}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="font-semibold text-neutral-500 uppercase text-[10px]">Client</span>
                <div className="font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                  {selectedAppointment.customer?.name}
                </div>
                {selectedAppointment.customer?.companyName && (
                  <div className="text-neutral-500">{selectedAppointment.customer.companyName}</div>
                )}
                <div className="text-neutral-400">{selectedAppointment.customer?.email}</div>
              </div>

              <div>
                <span className="font-semibold text-neutral-500 uppercase text-[10px]">Assigned Staff</span>
                <div className="font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                  {selectedAppointment.staff ? selectedAppointment.staff.name : "Unassigned"}
                </div>
                {selectedAppointment.staff?.role && (
                  <div className="text-neutral-500">{selectedAppointment.staff.role}</div>
                )}
              </div>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-500">Date ({company.timezone}):</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {formatAppointmentTime(selectedAppointment.startTime, company.timezone, "EEEE, MMMM d, yyyy")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Time Interval:</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {formatAppointmentInterval(selectedAppointment.startTime, selectedAppointment.endTime, company.timezone)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Duration:</span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {selectedAppointment.service?.durationMinutes} minutes
                </span>
              </div>
            </div>

            {selectedAppointment.notes && (
              <div className="p-2.5 bg-neutral-50 dark:bg-neutral-900 rounded-lg text-neutral-600 dark:text-neutral-300">
                <span className="font-semibold">Notes:</span> {selectedAppointment.notes}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              {selectedAppointment.status !== "COMPLETED" && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAppointment}
                  disabled={isSubmitting}
                  className="gap-1 text-xs h-8"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              )}

              <div className="flex items-center gap-1.5 ml-auto">
                {selectedAppointment.status === "CONFIRMED" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenRescheduleModal}
                      disabled={isSubmitting}
                      className="text-xs h-8 gap-1"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Reschedule
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStatusUpdate("CANCELLED")}
                      disabled={isSubmitting}
                      className="text-xs h-8"
                    >
                      Cancel Booking
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleStatusUpdate("COMPLETED")}
                      disabled={isSubmitting}
                      className="text-xs h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Mark Completed
                    </Button>
                  </>
                )}

                {selectedAppointment.status === "CANCELLED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusUpdate("CONFIRMED")}
                    disabled={isSubmitting}
                    className="text-xs h-8"
                  >
                    Reactivate
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAppointment(null)}
                  className="text-xs h-8"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Reschedule Appointment Dialog */}
      <Dialog
        isOpen={isRescheduleModalOpen}
        onClose={() => setIsRescheduleModalOpen(false)}
        title="Reschedule Appointment"
        description={`Choose a new time slot in ${company.timezone}. Duration and pricing remain preserved.`}
        maxWidth="md"
      >
        <form onSubmit={handleRescheduleSubmit} className="space-y-4">
          <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedAppointment?.service?.title}
            </div>
            <div className="text-neutral-500">
              Client: <span className="font-medium text-neutral-700 dark:text-neutral-300">{selectedAppointment?.customer?.name}</span>
            </div>
            {selectedAppointment?.staff && (
              <div className="text-neutral-500">
                Staff: <span className="font-medium text-neutral-700 dark:text-neutral-300">{selectedAppointment.staff.name}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                New Date *
              </label>
              <Input
                type="date"
                required
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                New Start Time *
              </label>
              <Input
                type="time"
                required
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
              />
            </div>
          </div>

          {/* Timezone Indicator & Preview */}
          <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
              <Globe className="h-3.5 w-3.5 text-neutral-600 dark:text-neutral-300 shrink-0" />
              <span>
                Operating in company timezone: <strong className="text-neutral-800 dark:text-neutral-200">{company.timezone}</strong>
              </span>
            </div>
            {selectedAppointment?.service && rescheduleDate && rescheduleTime && (
              <div className="pt-1.5 border-t border-neutral-200/60 dark:border-neutral-800">
                <div className="font-semibold text-neutral-700 dark:text-neutral-300 flex justify-between">
                  <span>New Time Slot:</span>
                  <span className="text-neutral-900 dark:text-neutral-100 font-bold">
                    {rescheduleTime} – {getCalculatedRescheduleEndTime()} ({selectedAppointment.service.durationMinutes} mins)
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Session Notes
            </label>
            <Input
              placeholder="Add or update notes..."
              value={rescheduleNotes}
              onChange={(e) => setRescheduleNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRescheduleModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !rescheduleDate || !rescheduleTime}
            >
              {isSubmitting ? "Rescheduling..." : "Save & Reschedule"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Service Dialog */}
      <Dialog
        isOpen={isServiceModalOpen}
        onClose={() => setIsServiceModalOpen(false)}
        title="Create New Service Offering"
        description="Add a service to your catalog for client scheduling."
        maxWidth="md"
      >
        <form onSubmit={handleCreateServiceSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Service Title *
            </label>
            <Input
              required
              placeholder="e.g. Cloud Architecture Consultation"
              value={serviceTitle}
              onChange={(e) => setServiceTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Duration (Minutes) *
              </label>
              <Input
                type="number"
                min="15"
                max="480"
                required
                value={serviceDuration}
                onChange={(e) => setServiceDuration(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Price ({company.currency}) *
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                required
                value={servicePrice}
                onChange={(e) => setServicePrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Category
            </label>
            <Input
              placeholder="e.g. Strategy, Implementation, Support"
              value={serviceCategory}
              onChange={(e) => setServiceCategory(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Description
            </label>
            <Input
              placeholder="Detailed description of the service deliverables..."
              value={serviceDesc}
              onChange={(e) => setServiceDesc(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsServiceModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Save Service"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Service Dialog */}
      <Dialog
        isOpen={isEditServiceModalOpen}
        onClose={() => setIsEditServiceModalOpen(false)}
        title="Edit Service Offering"
        description="Update service details, pricing, and catalog configuration."
        maxWidth="md"
      >
        <form onSubmit={handleEditServiceSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Service Title *
            </label>
            <Input
              required
              value={editServiceTitle}
              onChange={(e) => setEditServiceTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Duration (Minutes) *
              </label>
              <Input
                type="number"
                min="15"
                max="480"
                required
                value={editServiceDuration}
                onChange={(e) => setEditServiceDuration(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Price ({company.currency}) *
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                required
                value={editServicePrice}
                onChange={(e) => setEditServicePrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Category
            </label>
            <Input
              value={editServiceCategory}
              onChange={(e) => setEditServiceCategory(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Description
            </label>
            <Input
              value={editServiceDesc}
              onChange={(e) => setEditServiceDesc(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditServiceModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
