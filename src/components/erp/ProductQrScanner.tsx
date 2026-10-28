"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import {
  QrCode,
  Camera,
  Search,
  RefreshCw,
  Printer,
  ShoppingCart,
  AlertCircle,
  Warehouse,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getProductByQrAction } from "@/app/(dashboard)/stock/actions";
import { ProductQrResult } from "@/lib/products/qr";
import { useRouter } from "next/navigation";

interface ProductQrScannerProps {
  onSelectProductForSalesOrder?: (productResult: ProductQrResult) => void;
  onSelectProduct?: (productResult: ProductQrResult) => void;
  isModal?: boolean;
  onClose?: () => void;
}

export default function ProductQrScanner({
  onSelectProductForSalesOrder,
  onSelectProduct,
  isModal = false,
  onClose,
}: ProductQrScannerProps) {
  const router = useRouter();
  const selectHandler = onSelectProduct || onSelectProductForSalesOrder;
  const [scannedResult, setScannedResult] = useState<ProductQrResult | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isPending, startTransition] = useTransition();

  const scannerRef = useRef<any>(null);
  const scannerContainerId = "product-qr-reader-container";

  // Beep sound on scan
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {}
  };

  const handleProcessQr = (qrString: string) => {
    if (!qrString || isPending) return;
    setErrorMsg(null);
    playBeep();

    // Stop active camera scanner before rendering results
    stopCameraScanner();

    startTransition(async () => {
      const res = await getProductByQrAction(qrString.trim());
      if (res.success && res.data) {
        setScannedResult(res.data);
      } else {
        setErrorMsg(res.error || "No product found matching this QR code.");
      }
    });
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    setErrorMsg(null);
    setIsScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      // Clear any existing instance
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {}
        scannerRef.current = null;
      }

      const html5QrCode = new Html5Qrcode(scannerContainerId);
      scannerRef.current = html5QrCode;

      const qrCodeSuccessCallback = (decodedText: string) => {
        handleProcessQr(decodedText);
      };

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        qrCodeSuccessCallback,
        () => {} // ignore frame errors
      );
    } catch (err: any) {
      console.warn("Camera init error:", err);
      setIsScanning(false);
      setCameraError(
        err?.message ||
          "Could not access camera. Please ensure camera permissions are allowed in your browser, or enter the QR/Product Code manually."
      );
    }
  };

  const stopCameraScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {}
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleProcessQr(manualCode);
  };

  const handleResetForNextScan = () => {
    setScannedResult(null);
    setManualCode("");
    setErrorMsg(null);
    setCameraError(null);
    // Restart camera
    startCameraScanner();
  };

  const handlePrintQr = () => {
    if (!scannedResult) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Label - ${scannedResult.product.name}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 24px;
              margin: 0;
            }
            .label-card {
              border: 2px dashed #0f172a;
              border-radius: 8px;
              padding: 20px;
              display: inline-block;
              max-width: 320px;
            }
            .title {
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 4px;
              color: #0f172a;
            }
            .sku {
              font-size: 13px;
              color: #475569;
              margin-bottom: 12px;
              font-family: monospace;
            }
            .qr-img {
              width: 200px;
              height: 200px;
              margin: 0 auto 8px auto;
              display: block;
            }
            .code {
              font-size: 12px;
              font-weight: bold;
              letter-spacing: 1px;
              color: #0f172a;
              font-family: monospace;
              background: #f1f5f9;
              padding: 4px 8px;
              border-radius: 4px;
              display: inline-block;
            }
            .price {
              margin-top: 8px;
              font-size: 14px;
              font-weight: bold;
              color: #2563eb;
            }
          </style>
        </head>
        <body>
          <div class="label-card">
            <div class="title">${scannedResult.product.name}</div>
            <div class="sku">SKU: ${scannedResult.product.sku} | ${scannedResult.product.category}</div>
            <img src="${scannedResult.product.qrDataUrl}" class="qr-img" />
            <div class="code">${scannedResult.product.qrCode}</div>
            <div class="price">MRP: ₹${scannedResult.product.mrp || scannedResult.product.sellingPrice}</div>
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Start scanner on mount
  useEffect(() => {
    startCameraScanner();
    return () => {
      stopCameraScanner();
    };
  }, []);

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden text-xs">
      {/* Header Bar */}
      <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 bg-blue-600 rounded">
            <QrCode className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-white">Product QR Code Scanner</h2>
            <p className="text-[11px] text-slate-300">
              Instant live stock lookup across all warehouses
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
            title={soundEnabled ? "Sound on" : "Muted"}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          {isModal && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6">
        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium">{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-red-400 hover:text-red-700 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* VIEW 1: ACTIVE SCANNER VIEW */}
        {!scannedResult && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Camera Viewport */}
            <div className="md:col-span-7 flex flex-col items-center">
              <div className="w-full max-w-sm relative rounded-lg overflow-hidden border-2 border-slate-300 bg-slate-950 aspect-square flex flex-col items-center justify-center">
                <div id={scannerContainerId} className="w-full h-full" />

                {/* Laser scan line overlay when scanning */}
                {isScanning && !cameraError && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    <div className="w-56 h-56 border-2 border-dashed border-blue-400/80 rounded-lg relative overflow-hidden">
                      <div className="absolute inset-x-0 h-0.5 bg-blue-500 shadow-[0_0_8px_#3b82f6] animate-pulse top-1/2" />
                    </div>
                    <span className="mt-3 text-[11px] text-blue-200 font-mono tracking-wider uppercase bg-slate-900/80 px-2 py-0.5 rounded">
                      Align QR code inside box
                    </span>
                  </div>
                )}

                {/* Camera Error Fallback */}
                {cameraError && (
                  <div className="absolute inset-0 bg-slate-900/90 text-white p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <Camera className="h-8 w-8 text-amber-400" />
                    <p className="text-xs text-slate-200 font-medium">{cameraError}</p>
                    <button
                      onClick={startCameraScanner}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition"
                    >
                      Retry Camera
                    </button>
                  </div>
                )}
              </div>

              {/* Camera Control Bar */}
              <div className="mt-3 flex items-center space-x-3">
                {isScanning ? (
                  <button
                    onClick={stopCameraScanner}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition cursor-pointer"
                  >
                    Pause Camera
                  </button>
                ) : (
                  <button
                    onClick={startCameraScanner}
                    className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Start Camera</span>
                  </button>
                )}
              </div>
            </div>

            {/* Manual QR / SKU Entry Section */}
            <div className="md:col-span-5 bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                  <Search className="h-4 w-4 text-blue-600" />
                  <span>Manual QR / Code Search</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  If your device camera is unavailable, type or paste the QR Code, Product SKU, or Code.
                </p>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 text-[11px]">
                    Enter QR Code, SKU, or Product Code
                  </label>
                  <input
                    type="text"
                    required
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="e.g. PROD-QR-A8F2... or PRD0001"
                    className="w-full p-2 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Searching Live Stock...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-3.5 w-3.5" />
                      <span>Look Up Inventory</span>
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
                <p className="font-semibold text-slate-700">Quick Tips:</p>
                <p>• Point camera directly at the QR sticker on the product box.</p>
                <p>• Stock is retrieved in real-time directly from the database.</p>
                <p>• Formula: <strong>Available = On Hand - Reserved</strong></p>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: PRODUCT SCANNED RESULT CARD */}
        {scannedResult && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-150">
            {/* Top Product Header Card */}
            <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-start space-x-3.5">
                {/* QR Code preview */}
                {scannedResult.product.qrDataUrl && (
                  <div className="bg-white p-1.5 rounded border border-blue-200 shrink-0">
                    <img
                      src={scannedResult.product.qrDataUrl}
                      alt="Product QR"
                      className="h-16 w-16"
                    />
                  </div>
                )}
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[11px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                      {scannedResult.product.code}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      SKU: {scannedResult.product.sku}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-1">
                    {scannedResult.product.name}
                  </h3>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Category: <strong>{scannedResult.product.category}</strong> | Brand: <strong>{scannedResult.product.brand}</strong> | Unit: <strong>{scannedResult.product.unit}</strong>
                  </div>
                </div>
              </div>

              {/* Price Details */}
              <div className="text-left md:text-right">
                <div className="text-xs text-slate-500">Selling Price</div>
                <div className="text-lg font-extrabold text-blue-700">
                  ₹{scannedResult.product.sellingPrice.toLocaleString("en-IN")}
                </div>
                {scannedResult.product.mrp > 0 && (
                  <div className="text-[11px] text-slate-400">
                    MRP: ₹{scannedResult.product.mrp.toLocaleString("en-IN")}
                  </div>
                )}
              </div>
            </div>

            {/* Warehouse Stock Availability Breakdown */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <h4 className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                  <Warehouse className="h-4 w-4 text-blue-600" />
                  <span>Current Inventory Across All Warehouses</span>
                </h4>
                <div className="text-[11px] text-slate-400">
                  Last updated: <strong>{scannedResult.lastUpdated}</strong>
                </div>
              </div>

              {/* Mobile Warehouse Cards View */}
              <div className="md:hidden space-y-2.5">
                {scannedResult.warehouses.length === 0 ? (
                  <div className="p-4 bg-white border border-slate-200 rounded text-center text-slate-400 text-xs">
                    No warehouses registered.
                  </div>
                ) : (
                  scannedResult.warehouses.map((w) => (
                    <div key={w.warehouseId} className="bg-white border border-slate-200 rounded-lg p-3 shadow-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-900 text-xs flex items-center space-x-1.5">
                          <Warehouse className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          <span>{w.warehouseName}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            w.available > 0 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {w.available} {scannedResult.product.unit} Available
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded border border-slate-100 text-center">
                        <div>
                          <div className="text-[11px] text-slate-400">On Hand</div>
                          <div className="font-medium text-slate-700">{w.onHand} {scannedResult.product.unit}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-amber-700">Reserved</div>
                          <div className="font-medium text-amber-700">{w.reserved > 0 ? `${w.reserved} ${scannedResult.product.unit}` : "0"}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {/* Mobile Total Summary Card */}
                <div className="bg-slate-900 text-white rounded-lg p-3.5 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Total Available</div>
                    <div className="text-xs text-slate-300">
                      On Hand: {scannedResult.totalOnHand} • Reserved: {scannedResult.totalReserved}
                    </div>
                  </div>
                  <span className="px-3 py-1.5 bg-emerald-600 text-white rounded font-extrabold text-sm shadow-xs">
                    {scannedResult.totalAvailable} {scannedResult.product.unit}
                  </span>
                </div>
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block border border-slate-200 rounded-lg overflow-hidden bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="px-4 py-2.5">Warehouse</th>
                      <th className="px-4 py-2.5 text-right">On Hand</th>
                      <th className="px-4 py-2.5 text-right">Reserved</th>
                      <th className="px-4 py-2.5 text-right">Available Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {scannedResult.warehouses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-center text-slate-400">
                          No warehouses registered.
                        </td>
                      </tr>
                    ) : (
                      scannedResult.warehouses.map((w) => (
                        <tr key={w.warehouseId} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-900 flex items-center space-x-1.5">
                            <Warehouse className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{w.warehouseName}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-slate-600">
                            {w.onHand} {scannedResult.product.unit}
                          </td>
                          <td className="px-4 py-2.5 text-right text-amber-700 font-medium">
                            {w.reserved > 0 ? `${w.reserved} ${scannedResult.product.unit}` : "0"}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${
                                w.available > 0
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {w.available} {scannedResult.product.unit}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {/* Summary Total Row */}
                  <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-3 uppercase text-[11px]">Total Across All Locations</td>
                      <td className="px-4 py-3 text-right">{scannedResult.totalOnHand}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{scannedResult.totalReserved}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-extrabold">
                          {scannedResult.totalAvailable} {scannedResult.product.unit} Available
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Bottom Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handlePrintQr}
                  className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-3.5 py-2 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold transition cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print QR Label</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetForNextScan}
                  className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded font-semibold transition cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Scan Another Product</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (selectHandler) {
                      selectHandler(scannedResult);
                    } else {
                      router.push(`/sales?selectedProduct=${scannedResult.product.id}`);
                    }
                  }}
                  className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition cursor-pointer"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>Add to Sales Order</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
