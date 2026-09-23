"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import {
  getDocumentsData,
  createDocument,
  deleteDocument,
} from "@/lib/actions";
import {
  Folder,
  FileText,
  Upload,
  Search,
  Eye,
  Plus,
  Tag,
  Trash2,
  RefreshCw,
  AlertCircle,
  Loader2,
  Shield,
  FileCheck,
} from "lucide-react";

interface DocItem {
  id: string;
  name: string;
  category: string;
  size: string;
  url: string | null;
  mimeType: string;
  tags: string;
  uploadedById: string | null;
  uploadedByName: string;
  createdAt: string;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("EMPLOYEE");
  const [activeFolder, setActiveFolder] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);

  // Delete Modal
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<DocItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Upload Form State
  const [fileName, setFileName] = useState("");
  const [fileCat, setFileCat] = useState("Contracts");
  const [fileSize, setFileSize] = useState("1.8 MB");
  const [fileTags, setFileTags] = useState("Legal, Enterprise");

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await getDocumentsData();
      if (res.success && res.documents) {
        setDocs(res.documents);
        if (res.currentUserId) setCurrentUserId(res.currentUserId);
        if (res.currentUserRole) setCurrentUserRole(res.currentUserRole);
      } else {
        setError(res.error || "Failed to load document vault");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while loading documents.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const formattedName = fileName.endsWith(".pdf") || fileName.includes(".")
        ? fileName.trim()
        : `${fileName.trim()}.pdf`;

      const res = await createDocument({
        name: formattedName,
        category: fileCat.trim() || "General",
        size: fileSize.trim() || "1.5 MB",
        tags: fileTags.trim() || "General",
        mimeType: "application/pdf",
      });

      if (res.success && res.document) {
        setDocs((prev) => [res.document as DocItem, ...prev]);
        setIsUploadOpen(false);
        setFileName("");
        setFileCat("Contracts");
        setFileSize("1.8 MB");
        setFileTags("Legal, Enterprise");
      } else {
        setFormError(res.error || "Failed to index document");
      }
    } catch (err: any) {
      setFormError(err?.message || "Failed to index document");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingDoc) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteDocument(deletingDoc.id);
      if (res.success) {
        setDocs((prev) => prev.filter((d) => d.id !== deletingDoc.id));
        setIsDeleteOpen(false);
        setDeletingDoc(null);
      } else {
        setDeleteError(res.error || "Failed to delete document");
      }
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete document");
    } finally {
      setIsDeleting(false);
    }
  };

  const categories = ["ALL", "Contracts", "Finance", "Security", "HR", "General"];

  const filteredDocs = docs.filter((d) => {
    const matchesCat = activeFolder === "ALL" || d.category === activeFolder;
    const matchesSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.tags.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.uploadedByName.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              Document Vault & Knowledge Repository
            </h1>
            <Badge variant="outline" className="text-xs">
              {docs.length} {docs.length === 1 ? "document" : "documents"}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Database-backed metadata index for contracts, invoices, compliance certifications, and internal assets.
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
          <Button onClick={() => setIsUploadOpen(true)} className="gap-2" size="sm">
            <Plus className="h-4 w-4" />
            Add Document
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

      {/* Folders Navigation Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {categories.map((cat) => {
          const count = cat === "ALL" ? docs.length : docs.filter((d) => d.category === cat).length;
          const isActive = activeFolder === cat;

          return (
            <button
              key={cat}
              onClick={() => setActiveFolder(cat)}
              className={`flex items-center justify-between rounded-2xl border p-3 text-xs font-semibold transition-all ${
                isActive
                  ? "border-neutral-900 bg-neutral-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Folder className="h-4 w-4 shrink-0" />
                <span className="truncate">{cat === "ALL" ? "All Files" : cat}</span>
              </div>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? "bg-neutral-700 text-neutral-200 dark:bg-neutral-200 dark:text-neutral-800" : "bg-neutral-200/50 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
        <Input
          placeholder="Search by title, tag, or author..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 rounded-xl"
        />
      </div>

      {/* Loading Skeleton */}
      {loading && docs.length === 0 ? (
        <Card className="p-6 border-neutral-200 dark:border-neutral-800">
          <div className="space-y-3 animate-pulse">
            <div className="h-8 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
            <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
            <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
          </div>
        </Card>
      ) : filteredDocs.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-neutral-200 dark:border-neutral-800">
          <FileText className="h-10 w-10 text-neutral-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
            No documents found
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
            {searchTerm || activeFolder !== "ALL"
              ? "No documents match your active search and category filters."
              : "Your organization document vault is empty. Click 'Index Document' to record your first asset."}
          </p>
        </Card>
      ) : (
        /* Documents Table */
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden dark:border-neutral-800 dark:bg-neutral-900">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Indexed By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {filteredDocs.map((doc) => {
                const canDelete =
                  currentUserRole === "ADMIN" ||
                  currentUserRole === "MANAGER" ||
                  doc.uploadedById === currentUserId;

                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="truncate max-w-xs">{doc.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{doc.category}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{doc.size}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-xs text-neutral-500">
                        <Tag className="h-3 w-3" />
                        {doc.tags}
                      </span>
                    </TableCell>
                    <TableCell className="text-neutral-600 dark:text-neutral-400">
                      {doc.uploadedByName}
                    </TableCell>
                    <TableCell className="text-xs text-neutral-500">
                      {formatDate(doc.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          onClick={() => setPreviewDoc(doc)}
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-7 px-2"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                        {canDelete && (
                          <button
                            onClick={() => {
                              setDeletingDoc(doc);
                              setDeleteError(null);
                              setIsDeleteOpen(true);
                            }}
                            className="p-1 rounded text-neutral-400 hover:text-red-600 transition-colors"
                            title="Delete document"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/* Index Document Modal */}
      <Dialog
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setFormError(null);
        }}
        title="Index Document to Vault"
        description="Register a document metadata asset into your organization's compliance repository."
      >
        <form onSubmit={handleUpload} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Document Title <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. SOC2 Type II Security Compliance Certification.pdf"
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={fileCat}
                onChange={(e) => setFileCat(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-xs text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="Contracts">Contracts</option>
                <option value="Finance">Finance</option>
                <option value="Security">Security</option>
                <option value="HR">HR</option>
                <option value="General">General</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                File Size
              </label>
              <Input
                value={fileSize}
                onChange={(e) => setFileSize(e.target.value)}
                placeholder="e.g. 2.4 MB"
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Metadata Tags
            </label>
            <Input
              value={fileTags}
              onChange={(e) => setFileTags(e.target.value)}
              placeholder="Legal, Enterprise, Compliance, Q3"
              className="text-xs"
            />
          </div>

          <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 p-4 text-center bg-neutral-50 dark:bg-neutral-900/50">
            <FileCheck className="h-6 w-6 text-blue-500 mx-auto mb-1.5" />
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Document metadata will be permanently indexed into your tenant knowledge vault.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsUploadOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add Document
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Preview Modal */}
      {previewDoc && (
        <Dialog
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          title={`Document Details: ${previewDoc.name}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 text-xs border border-neutral-200/60 dark:border-neutral-700/60">
              <div>
                <span className="text-neutral-400">Category:</span>{" "}
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{previewDoc.category}</span>
              </div>
              <div>
                <span className="text-neutral-400">Size:</span>{" "}
                <span className="font-mono text-neutral-800 dark:text-neutral-200">{previewDoc.size}</span>
              </div>
              <div>
                <span className="text-neutral-400">Indexed By:</span>{" "}
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{previewDoc.uploadedByName}</span>
              </div>
              <div>
                <span className="text-neutral-400">Created:</span>{" "}
                <span className="text-neutral-800 dark:text-neutral-200">{formatDate(previewDoc.createdAt)}</span>
              </div>
            </div>

            <div className="h-44 flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/50 p-6 text-center">
              <FileText className="h-10 w-10 text-blue-500 mb-2" />
              <p className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate max-w-sm">
                {previewDoc.name}
              </p>
              <div className="flex items-center gap-1 text-[11px] text-neutral-500 mt-1">
                <Tag className="h-3 w-3" />
                <span>{previewDoc.tags}</span>
              </div>
              <Badge variant="outline" className="mt-3 text-[10px]">
                Vault Registry Verified • Multi-Tenant Encrypted
              </Badge>
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <Button size="sm" onClick={() => setPreviewDoc(null)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Modal */}
      <Dialog
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeletingDoc(null);
          setDeleteError(null);
        }}
        title="Delete Document"
        description="Are you sure you want to remove this document metadata from the vault? This action cannot be undone."
      >
        <div className="space-y-4">
          {deleteError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {deleteError}
            </div>
          )}

          {deletingDoc && (
            <div className="rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800/50 space-y-1 border border-neutral-200/60 dark:border-neutral-700/60">
              <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                {deletingDoc.name}
              </div>
              <div className="text-neutral-500">
                Category: {deletingDoc.category} | Size: {deletingDoc.size}
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
                setDeletingDoc(null);
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
              onClick={handleDelete}
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
