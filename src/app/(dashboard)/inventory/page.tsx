"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import {
  getInventoryData,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/actions";
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  Barcode,
  Layers,
  Edit2,
  Trash2,
  RefreshCw,
  AlertCircle,
  Loader2,
  Filter,
} from "lucide-react";

interface ProductItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStockAlert: number;
  supplier: string;
  barcode: string;
  createdAt: string;
  updatedAt: string;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Create Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [prodName, setProdName] = useState("");
  const [prodSku, setProdSku] = useState("");
  const [prodCategory, setProdCategory] = useState("Hardware");
  const [prodPrice, setProdPrice] = useState("1200");
  const [prodCost, setProdCost] = useState("720");
  const [prodStock, setProdStock] = useState("10");
  const [prodMinStock, setProdMinStock] = useState("5");
  const [prodSupplier, setProdSupplier] = useState("Global Supply Co");
  const [prodBarcode, setProdBarcode] = useState("");

  // Edit Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editMinStock, setEditMinStock] = useState("");
  const [editSupplier, setEditSupplier] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Modal State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<ProductItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await getInventoryData();
      if (res.success && res.products) {
        setProducts(res.products);
        if (res.company?.currency) {
          setCurrency(res.company.currency);
        }
      } else {
        setError(res.error || "Failed to load inventory data");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while loading inventory.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await createProduct({
        name: prodName.trim(),
        sku: prodSku.trim().toUpperCase(),
        category: prodCategory.trim() || "Hardware",
        price: parseFloat(prodPrice) || 0,
        cost: parseFloat(prodCost) || 0,
        stock: parseInt(prodStock, 10) || 0,
        minStockAlert: parseInt(prodMinStock, 10) || 5,
        supplier: prodSupplier.trim() || "Global Supply Co",
        barcode: prodBarcode.trim() || undefined,
      });

      if (res.success && res.product) {
        setProducts((prev) => [res.product as ProductItem, ...prev]);
        setIsAddOpen(false);
        setProdName("");
        setProdSku("");
        setProdCategory("Hardware");
        setProdPrice("1200");
        setProdCost("720");
        setProdStock("10");
        setProdMinStock("5");
        setProdSupplier("Global Supply Co");
        setProdBarcode("");
      } else {
        setFormError(res.error || "Failed to create product");
      }
    } catch (err: any) {
      setFormError(err?.message || "Failed to create product");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (product: ProductItem) => {
    setEditingProduct(product);
    setEditPrice(product.price.toString());
    setEditCost(product.cost.toString());
    setEditStock(product.stock.toString());
    setEditMinStock(product.minStockAlert.toString());
    setEditSupplier(product.supplier);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setEditError(null);
    setIsSubmitting(true);

    try {
      const res = await updateProduct({
        productId: editingProduct.id,
        price: parseFloat(editPrice) || 0,
        cost: parseFloat(editCost) || 0,
        stock: parseInt(editStock, 10) || 0,
        minStockAlert: parseInt(editMinStock, 10) || 5,
        supplier: editSupplier.trim() || "Global Supply Co",
      });

      if (res.success && res.product) {
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? (res.product as ProductItem) : p))
        );
        setIsEditOpen(false);
        setEditingProduct(null);
      } else {
        setEditError(res.error || "Failed to update product");
      }
    } catch (err: any) {
      setEditError(err?.message || "Failed to update product");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteProduct(deletingProduct.id);
      if (res.success) {
        setProducts((prev) => prev.filter((p) => p.id !== deletingProduct.id));
        setIsDeleteOpen(false);
        setDeletingProduct(null);
      } else {
        setDeleteError(res.error || "Failed to delete product");
      }
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete product");
    } finally {
      setIsDeleting(false);
    }
  };

  const categories = Array.from(new Set(products.map((p) => p.category))).filter(Boolean);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.supplier.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === "ALL" || p.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const lowStockCount = products.filter((p) => p.stock <= p.minStockAlert).length;
  const totalAssetValue = products.reduce((s, p) => s + p.price * p.stock, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              Inventory & Stock Vault
            </h1>
            <Badge variant="outline" className="text-xs">
              {products.length} {products.length === 1 ? "item" : "items"}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Database-backed product catalog, SKU tracking, low stock alerts, and valuation metrics.
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
            Add Product
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 border-neutral-200 dark:border-neutral-800">
          <div className="text-xs text-neutral-500 font-semibold uppercase flex justify-between">
            <span>Total Catalog Items</span>
            <Package className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {products.length} {products.length === 1 ? "Product" : "Products"}
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Total active SKUs in organization vault</p>
        </Card>

        <Card className="p-4 border-neutral-200 dark:border-neutral-800">
          <div className="text-xs text-neutral-500 font-semibold uppercase flex justify-between">
            <span>Low Stock Alerts</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {lowStockCount} {lowStockCount === 1 ? "Item" : "Items"} Below Threshold
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Items requiring immediate reordering</p>
        </Card>

        <Card className="p-4 border-neutral-200 dark:border-neutral-800">
          <div className="text-xs text-neutral-500 font-semibold uppercase flex justify-between">
            <span>Total Asset Value</span>
            <Layers className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalAssetValue, currency)}
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Calculated from price × stock quantities</p>
        </Card>
      </div>

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search by product name, SKU, or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-neutral-400 hidden sm:inline" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            <option value="ALL">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && products.length === 0 ? (
        <Card className="p-6 border-neutral-200 dark:border-neutral-800">
          <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
            <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
            <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
            <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
          </div>
        </Card>
      ) : filteredProducts.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-neutral-200 dark:border-neutral-800">
          <Package className="h-10 w-10 text-neutral-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
            No products found
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
            {searchTerm || categoryFilter !== "ALL"
              ? "No items match your active filters. Try adjusting your search query."
              : "Your inventory vault is currently empty. Click 'Add Product' to register your first item."}
          </p>
          {searchTerm || categoryFilter !== "ALL" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setCategoryFilter("ALL");
              }}
              className="mt-4 text-xs"
            >
              Reset Filters
            </Button>
          ) : (
            <Button size="sm" onClick={() => setIsAddOpen(true)} className="mt-4 text-xs">
              <Plus className="h-4 w-4 mr-1.5" />
              Add First Product
            </Button>
          )}
        </Card>
      ) : (
        /* Inventory Table */
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden dark:border-neutral-800 dark:bg-neutral-900">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock Level</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {filteredProducts.map((p) => {
                const isLow = p.stock <= p.minStockAlert;

                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-bold text-neutral-900 dark:text-neutral-100">
                      {p.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-neutral-500">{p.sku}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.category}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {formatCurrency(p.price, currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isLow ? "destructive" : "success"}>
                        {p.stock} Units {isLow ? "(LOW STOCK)" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-neutral-600 dark:text-neutral-400">{p.supplier}</TableCell>
                    <TableCell className="font-mono text-xs text-neutral-400">
                      {p.barcode ? (
                        <span className="flex items-center gap-1">
                          <Barcode className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          <span>{p.barcode}</span>
                        </span>
                      ) : (
                        <span className="text-neutral-300 dark:text-neutral-700">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleStartEdit(p)}
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                          title="Edit product"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingProduct(p);
                            setDeleteError(null);
                            setIsDeleteOpen(true);
                          }}
                          className="p-1 rounded text-neutral-400 hover:text-red-600 transition-colors"
                          title="Delete product"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/* Add Product Modal */}
      <Dialog
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setFormError(null);
        }}
        title="Add Product to Vault"
        description="Register a new hardware item or product into inventory."
      >
        <form onSubmit={handleAddProduct} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Product Name <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={prodName}
              onChange={(e) => setProdName(e.target.value)}
              placeholder="e.g. Cisco Edge Router 9000"
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                SKU <span className="text-red-500">*</span>
              </label>
              <Input
                required
                value={prodSku}
                onChange={(e) => setProdSku(e.target.value)}
                placeholder="e.g. NET-RTR-01"
                className="text-xs font-mono uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Category
              </label>
              <Input
                value={prodCategory}
                onChange={(e) => setProdCategory(e.target.value)}
                placeholder="Hardware, Networking, Security..."
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Selling Price ($) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={prodPrice}
                onChange={(e) => setProdPrice(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Cost Price ($)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={prodCost}
                onChange={(e) => setProdCost(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Stock Initial Quantity
              </label>
              <Input
                type="number"
                min="0"
                value={prodStock}
                onChange={(e) => setProdStock(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Min Stock Alert Threshold
              </label>
              <Input
                type="number"
                min="0"
                value={prodMinStock}
                onChange={(e) => setProdMinStock(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Supplier
              </label>
              <Input
                value={prodSupplier}
                onChange={(e) => setProdSupplier(e.target.value)}
                placeholder="Dell Enterprise, Cisco Supply..."
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Barcode / Serial
              </label>
              <Input
                value={prodBarcode}
                onChange={(e) => setProdBarcode(e.target.value)}
                placeholder="e.g. 88902194012"
                className="text-xs font-mono"
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
              Save Product
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Product Modal */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingProduct(null);
          setEditError(null);
        }}
        title="Edit Product"
        description={editingProduct ? `Update details for ${editingProduct.name} (${editingProduct.sku})` : "Update product"}
      >
        <form onSubmit={handleUpdateProduct} className="space-y-4">
          {editError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {editError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Price ($)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Cost ($)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Current Stock Level
              </label>
              <Input
                type="number"
                min="0"
                required
                value={editStock}
                onChange={(e) => setEditStock(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Min Stock Alert
              </label>
              <Input
                type="number"
                min="0"
                value={editMinStock}
                onChange={(e) => setEditMinStock(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Supplier
            </label>
            <Input
              value={editSupplier}
              onChange={(e) => setEditSupplier(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsEditOpen(false);
                setEditingProduct(null);
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

      {/* Delete Product Modal */}
      <Dialog
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeletingProduct(null);
          setDeleteError(null);
        }}
        title="Delete Product"
        description="Are you sure you want to remove this product from your inventory vault? This action cannot be undone."
      >
        <div className="space-y-4">
          {deleteError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {deleteError}
            </div>
          )}

          {deletingProduct && (
            <div className="rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800/50 space-y-1 border border-neutral-200/60 dark:border-neutral-700/60">
              <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                {deletingProduct.name}
              </div>
              <div className="text-neutral-500">
                SKU: {deletingProduct.sku} | Category: {deletingProduct.category} | Stock: {deletingProduct.stock}
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
                setDeletingProduct(null);
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
              onClick={handleDeleteProduct}
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
