import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Context } from "../js/store/appContext.jsx";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { storeConfig } from "../config/storeConfig.js";
import CuponBox from "./cart/CuponBox.jsx";
import { normalizeCouponCode, validateCoupon } from "../utils/coupons.js";
import { formatCurrency, getCurrencySymbol } from "../utils/price.js";
import mercadoPagoLogo from "../assets/mp-logo1.png";


const API = import.meta.env.VITE_BACKEND_URL?.replace(/\/+$/, "") || "";
const getPublicMediaSrc = (fileName = "") => {
  if (!fileName) return "";
  return fileName.startsWith("/") ? fileName : `/${fileName}`;
};

// --- helpers ---
const normalizeImagePath = (u = "") => {
  if (!u) return "";
  if (u.startsWith("/admin/uploads/")) u = u.replace("/admin", "/public");
  if (u.startsWith("/uploads/")) u = `/public${u}`;
  return u;
};

const toAbsUrl = (u = "") => {
  u = normalizeImagePath(u);
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/public/")) return `${API}${u}`;
  if (u.startsWith("/")) return u;
  return `${API}/${u}`;
};

const getTitle = (it) => {
  let base = String(it?.name ?? it?.product?.name ?? it?.title ?? "Producto");
  if (it.selectedFlavor) base += ` (${it.selectedFlavor})`;
  return base;
};

const getSelectedMl = (it) => {
  const raw = it?.selected_size_ml ?? it?.volume_ml ?? it?.product?.volume_ml;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

// BLOQUE WHATSAPP SEGURO A REPLICAR EN OTRAS APPS
const buildWhatsAppUrl = (phone, message) => {
  const encodedMessage = encodeURIComponent(message);
  const userAgent = navigator.userAgent || "";

  if (/android|iphone|ipad|ipod/i.test(userAgent)) {
    return `whatsapp://send?phone=${phone}&text=${encodedMessage}`;
  }

  return `https://wa.me/${phone}?text=${encodedMessage}`;
};

const buildWhatsAppWebUrl = (phone, message) => {
  const encodedMessage = encodeURIComponent(message);
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodedMessage}&type=phone_number&app_absent=0`;
};

const openWhatsAppFallbackUrl = (url) => {
  const whatsappWindow = window.open("about:blank", "_blank");
  if (whatsappWindow) {
    whatsappWindow.opener = null;
    whatsappWindow.location.href = url;
  } else {
    window.location.href = url;
  }
};

export default function Cart({ isOpen: controlledOpen, onClose: controlledOnClose }) {
  const { store, actions } = useContext(Context);
  const [showCheckout, setShowCheckout] = useState(false);
  const [sendingOrder, setSendingOrder] = useState(false);
  const [payingMercadoPago, setPayingMercadoPago] = useState(false);
  const [whatsappOrderPrompt, setWhatsappOrderPrompt] = useState(null);

  const [customerData, setCustomerData] = useState(() => {
    const saved = localStorage.getItem("customerData");
    const defaults = { name: "", phone: "", email: "", zone: "", payment: "Coordinar" };

    if (!saved) return defaults;

    try {
      const savedData = JSON.parse(saved);
      delete savedData.coupon;
      const parsed = { ...defaults, ...savedData };
      return { ...parsed, payment: "Coordinar" };
    } catch {
      return defaults;
    }
  });
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponStatus, setCouponStatus] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const isWholesale = location.pathname.startsWith("/mayorista");
  const pricePrefix = getCurrencySymbol();
  const whatsappPhone = storeConfig.contact.whatsapp;
  const couponEnabled = storeConfig.features?.coupon === true;


  const isRouteMode = controlledOpen === undefined && controlledOnClose === undefined;
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = isRouteMode ? internalOpen : !!controlledOpen;
  const cartBackgroundImage = getPublicMediaSrc(storeConfig.appearance?.page?.backgroundImage || "fondosisisis.png");
  const cartBackgroundStyle = cartBackgroundImage
    ? {
      backgroundImage: `url(${cartBackgroundImage})`,
      backgroundPosition: "center center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    }
    : {
      backgroundColor: storeConfig.appearance?.page?.backgroundColor || "#ffffff",
    };

  const close = () => {
    if (isRouteMode) {
      setInternalOpen(false);
      setTimeout(() => navigate(-1), 180);
    } else if (controlledOnClose) {
      controlledOnClose();
    }
  };

  // devuelve precio correcto según modo
  const getItemPrice = (item) => {
    const wholesalePrice = Number(item.price_wholesale);
    const retailPrice = Number(item.price);

    if (isWholesale) {
      if (wholesalePrice > 0) return wholesalePrice;
      return null; // mayorista sin precio → consultar
    }
    return retailPrice > 0 ? retailPrice : null; // minorista sin precio o 0 → consultar
  };



  // ===============================
  // MENSAJE WHATSAPP
  // ===============================
  // ===============================
  // TOTAL DEL CARRITO (VISIBLE EN UI)
  // ===============================

  const total = (store.cart || []).reduce((sum, item) => {
    const price = getItemPrice(item);
    if (price === null) return sum; // si es "consultar" no suma
    return sum + price * (Number(item.quantity) || 0);
  }, 0);

  const couponTotals = couponEnabled && appliedCoupon
    ? (() => {
      const subtotal = Math.round(total);
      const percent = Number(appliedCoupon.percent) || 0;
      const discount = Math.round(subtotal * percent / 100);

      return {
        ...appliedCoupon,
        subtotal,
        discount,
        total: Math.max(0, subtotal - discount),
      };
    })()
    : null;

  const finalTotal = couponTotals ? couponTotals.total : Math.round(total);

  const applyCoupon = async () => {
    if (!couponEnabled) return;

    const code = normalizeCouponCode(couponCode);

    if (!code) {
      setCouponStatus({ type: "error", message: "Ingresá un cupón" });
      return;
    }

    if (total <= 0) {
      setCouponStatus({ type: "error", message: "El cupón se aplica a productos con precio" });
      return;
    }

    setValidatingCoupon(true);
    setCouponStatus(null);

    try {
      const result = await validateCoupon({ code, subtotal: total });

      if (!result.valid) {
        setAppliedCoupon(null);
        setCouponStatus({ type: "error", message: result.error || "Cupón inválido o inactivo" });
        return;
      }

      setCouponCode(result.code);
      setAppliedCoupon(result);
      setCouponStatus({ type: "success", message: "Cupón aplicado" });
    } catch (error) {
      console.error("Error validando cupón:", error);
      setAppliedCoupon(null);
      setCouponStatus({ type: "error", message: "No se pudo validar el cupón" });
    } finally {
      setValidatingCoupon(false);
    }
  };

  const clearCoupon = () => {
    setAppliedCoupon(null);
    setCouponStatus(null);
    setCouponCode("");

    setCustomerData((prev) => {
      const next = { ...prev };
      delete next.coupon;
      localStorage.setItem("customerData", JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    if (!showCheckout) return;
    setCustomerData((prev) => ({ ...prev, payment: "Coordinar" }));
  }, [showCheckout]);


  const buildWhatsAppMessage = () => {
    if (!store.cart || store.cart.length === 0) return "";

    const isWholesale = window.location.pathname.startsWith("/mayorista");

    let message = isWholesale
      ? "Hola! Quiero hacer el siguiente pedido:\n*PEDIDO MAYORISTA*\n\n"
      : "Hola! Quiero hacer el siguiente pedido:\n\n";

    let total = 0;
    let hasUnknownPrice = false;

    store.cart.forEach((item) => {
      const name = item.name;
      const flavor = item.selectedFlavor ? ` (${item.selectedFlavor})` : "";
      const sizeMl = getSelectedMl(item);
      const size = sizeMl ? ` • ${sizeMl}ml` : "";
      const qty = Number(item.quantity) || 0;

      const wholesalePrice = Number(item.price_wholesale);
      const retailPrice = Number(item.price);

      const price = isWholesale
        ? (wholesalePrice > 0 ? wholesalePrice : null)
        : (retailPrice > 0 ? retailPrice : null);

      message += `• *${qty} x ${(name + flavor + size).trim()}*\n`;

      if (price !== null) {
        const subtotal = price * qty;
        total += subtotal;

        message += `   ${formatCurrency(price)} c/u\n`;
        message += `   Subtotal: ${formatCurrency(subtotal)}\n\n`;
      } else {
        hasUnknownPrice = true;
        message += `   Precio: Consultar\n\n`;
      }
    });

    if (hasUnknownPrice) {
      message += "*TOTAL:* Consultar\n\n";
    } else if (couponEnabled && couponTotals) {
      message += `*Subtotal original:* ~${formatCurrency(Math.round(total))}~\n`;
      message += `*Cupón ${couponTotals.code} (${couponTotals.percent}% OFF):* -${formatCurrency(couponTotals.discount)}\n`;
      message += `*TOTAL CON DESCUENTO:* ${formatCurrency(couponTotals.total)}\n\n`;
    } else {
      message += `*TOTAL:* ${formatCurrency(total)}\n\n`;
    }

    // 🚚 info de envío (PRO y simple)
    message += "🚚 Envío: a coordinar con el vendedor\n\n";

    message += "_Los precios y la disponibilidad serán confirmados por el vendedor al responder el pedido._\n\n";

    message += "Gracias!";


    return message; // ⚠️ IMPORTANTE: SIN encode
  };


  const handleCustomerChange = (e) => {
    const { name, value } = e.target;
    setCustomerData(prev => ({ ...prev, [name]: value }));
  };

  const selectPayment = (method) => {
    setCustomerData(prev => ({ ...prev, payment: method }));
  };


  const sendOrder = async () => {
    if (sendingOrder) return;

    if (!store.cart || store.cart.length === 0) {
      alert("Tu carrito está vacío");
      return;
    }

    if (!customerData.name.trim() || !customerData.phone.trim() || !customerData.zone.trim()) {
      alert("Por favor completá tus datos");
      return;
    }

    setSendingOrder(true);

    const customerDataToSave = { ...customerData };
    delete customerDataToSave.coupon;
    localStorage.setItem("customerData", JSON.stringify({
      ...customerDataToSave,
      payment: "Coordinar",
    }));

    const orderText = buildWhatsAppMessage();

    const extraData = `

Datos del cliente:

Nombre: ${customerData.name}
Teléfono: ${customerData.phone}
Localidad / Zona: ${customerData.zone}
Pago: ${customerData.payment}
${couponEnabled && couponTotals ? `Cupón aplicado: ${couponTotals.code} (${couponTotals.percent}% OFF)` : ""}

`;

    const finalMessage = orderText.replace(
      "Gracias!",
      `${extraData}Gracias!`
    );

    // 🔹 Construir items del pedido
    const isWholesale = window.location.pathname.startsWith("/mayorista");

    const orderItems = store.cart.map(item => ({
      product_id: item.id,   // 👈 obligatorio
      quantity: item.quantity,
      price: isWholesale
        ? (Number(item.price_wholesale) > 0 ? Number(item.price_wholesale) : 0)
        : (Number(item.price) > 0 ? Number(item.price) : 0),
      selected_flavor: item.selectedFlavor || null,
      selected_size_ml: getSelectedMl(item)
    }));

    const whatsappUrl = buildWhatsAppUrl(whatsappPhone, finalMessage);
    const whatsappFallbackUrl = buildWhatsAppWebUrl(whatsappPhone, finalMessage);

    const redirectToWhatsApp = () => {
      if (whatsappUrl.startsWith("whatsapp://")) {
        window.location.href = whatsappUrl;
        return;
      }

      const opened = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      if (!opened) {
        window.location.href = whatsappUrl;
      }
    };

    const saveOrder = fetch(`${API}/public/orders`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customer_first_name: customerData.name,
        customer_last_name: "",
        customer_phone: customerData.phone,
        shipping_address: {
          mode: "coordinar",
          city: customerData.zone,
          label: "A coordinar",
          phone: customerData.phone
        },
        payment_method: customerData.payment,
        order_items: orderItems,
        total_amount: finalTotal,
        coupon_code: couponEnabled ? couponTotals?.code || null : null,
        billing_address: {
          order_type: isWholesale ? "wholesale" : "retail",
          ...(couponEnabled && couponTotals ? { coupon: couponTotals } : {}),
        },
        status: "pendiente"
      })
    });

    setWhatsappOrderPrompt({
      fallbackUrl: whatsappFallbackUrl,
      status: "saving"
    });
    setShowCheckout(false);
    clearCoupon();
    redirectToWhatsApp();

    try {
      const response = await saveOrder;
      if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
      setWhatsappOrderPrompt(prev => prev ? { ...prev, status: "saved" } : prev);
    } catch (err) {
      console.error("Error guardando pedido:", err);
      setWhatsappOrderPrompt(prev => prev
        ? { ...prev, status: "failed" }
        : { fallbackUrl: whatsappFallbackUrl, status: "failed" }
      );
    } finally {
      setSendingOrder(false);
    }
  };

  const payWithMercadoPago = async () => {
    if (payingMercadoPago) return;

    if (!store.cart || store.cart.length === 0) {
      alert("Tu carrito está vacío");
      return;
    }

    let customerName = customerData.name.trim();
    let customerPhone = customerData.phone.trim();
    let customerEmail = customerData.email.trim().toLowerCase();
    let customerZone = customerData.zone.trim();

    if (!customerName || !customerPhone || !customerEmail || !customerZone) {
      if (isRouteMode) {
        customerName = customerName || window.prompt("Nombre y Apellido")?.trim() || "";
        customerPhone = customerPhone || window.prompt("Teléfono")?.trim() || "";
        customerEmail = customerEmail || window.prompt("Email para Mercado Pago")?.trim().toLowerCase() || "";
        customerZone = customerZone || window.prompt("Zona / Localidad")?.trim() || "";

        setCustomerData(prev => ({
          ...prev,
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          zone: customerZone,
        }));
      }
    }

    if (!customerName || !customerPhone || !customerEmail || !customerZone) {
      setShowCheckout(true);
      alert("Para pagar con Mercado Pago completá nombre, teléfono, email y zona/localidad.");
      return;
    }

    const items = [];

    try {
      for (const item of store.cart) {
        const price = getItemPrice(item);
        if (price === null || price <= 0) {
          throw new Error(`El producto "${item.name}" no tiene precio para pagar con Mercado Pago.`);
        }

        const productId = item.product_id ?? item.id;
        if (!productId) {
          throw new Error(`Falta el ID del producto "${item.name}".`);
        }

        items.push({
          id: String(productId),
          title: getTitle(item),
          quantity: Math.max(1, parseInt(item.quantity || 1, 10)),
          unit_price: Number(price),
          selected_flavor: item.selectedFlavor || null,
          selected_size_ml: getSelectedMl(item),
        });
      }
    } catch (error) {
      alert(error.message);
      return;
    }

    const [firstName, ...lastNameParts] = customerName.split(/\s+/);
    const token = localStorage.getItem("token");
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    setPayingMercadoPago(true);
    let redirectingToMercadoPago = false;

    try {
      const reportItems = items.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.quantity * item.unit_price,
        selected_flavor: item.selected_flavor,
        selected_size_ml: item.selected_size_ml,
      }));

      localStorage.setItem("customerData", JSON.stringify({
        ...customerData,
        email: customerEmail,
        payment: "Mercado Pago",
      }));
      localStorage.setItem("mpOrderReport", JSON.stringify({
        created_at: new Date().toISOString(),
        store_name: storeConfig.storeName,
        payment_method: "Mercado Pago",
        payment_status: "approved",
        customer: {
          name: customerName,
          phone: customerPhone,
          email: customerEmail,
          zone: customerZone,
        },
        items: reportItems,
        subtotal: reportItems.reduce((sum, item) => sum + item.subtotal, 0),
        total: finalTotal,
        coupon: couponEnabled && couponTotals ? {
          code: couponTotals.code,
          percent: couponTotals.percent,
          discount: couponTotals.discount,
        } : null,
      }));

      const response = await fetch(`${API}/api/mercadopago/create-preference`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          frontend_url: window.location.origin,
          items,
          payer: {
            email: customerEmail,
            name: firstName || customerName,
            surname: lastNameParts.join(" "),
            phone: { area_code: "", number: customerPhone },
          },
          form_email: customerEmail,
          billing_address: {
            firstName: firstName || customerName,
            lastName: lastNameParts.join(" "),
            email: customerEmail,
            phone: customerPhone,
            city: customerZone,
            country: "Argentina",
          },
          shipping_address: {
            mode: "coordinar",
            label: "A coordinar",
            city: customerZone,
            phone: customerPhone,
            email: customerEmail,
            firstName: firstName || customerName,
            lastName: lastNameParts.join(" "),
            cost: 0,
          },
          comment: couponEnabled && couponTotals
            ? `Cupón aplicado en carrito: ${couponTotals.code} (${couponTotals.percent}% OFF). Total mostrado: ${formatCurrency(finalTotal)}`
            : "",
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = data?.reason || data?.error || `Error HTTP ${response.status}`;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      const isProductionMercadoPago = import.meta.env.VITE_MP_PUBLIC_KEY?.startsWith("APP_USR-");
      const paymentUrl = isProductionMercadoPago
        ? data.init_point
        : data.sandbox_init_point || data.init_point;
      if (!paymentUrl) {
        throw new Error("Mercado Pago no devolvió un link de pago.");
      }

      redirectingToMercadoPago = true;
      window.location.assign(paymentUrl);
    } catch (error) {
      console.error("Error creando preferencia de Mercado Pago:", error);
      alert(`No se pudo iniciar Mercado Pago: ${error.message}`);
    } finally {
      if (!redirectingToMercadoPago) {
        setPayingMercadoPago(false);
      }
    }
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && isOpen && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const closeBtnRef = useRef(null);
  useEffect(() => {
    if (isOpen && closeBtnRef.current) closeBtnRef.current.focus();
  }, [isOpen]);

  useEffect(() => {
    // 🚨 Solo una vez al montar el componente
    if (window.location.pathname.includes("thank-you")) {
      actions.resetCartAfterPayment?.();
    }

    // Si el carrito está vacío, asegúrate de reflejarlo en localStorage
    if (Array.isArray(store.cart) && store.cart.length === 0) {
      localStorage.setItem("cart", JSON.stringify([]));
    }
  }, []); // 👈 Solo se ejecuta una vez al montar




  if (!controlledOpen && !isRouteMode && controlledOpen !== false) return null;

  const DrawerContent = (
    <div className="relative isolate flex h-full flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
        style={cartBackgroundStyle}
      />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between border-b border-white/50 p-4 text-white sm:p-5">
        <h2 id="cart-title" className="text-xl sm:text-2xl font-serif tracking-wide">
          Tu selección
        </h2>
        <button
          ref={closeBtnRef}
          onClick={close}
          aria-label="Cerrar carrito"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-black/20 bg-white p-0 text-2xl leading-none text-black shadow-sm transition-colors hover:bg-gray-100 hover:text-black"
          style={{ backgroundColor: "#ffffff" }}
        >
          <span className="-mt-0.5 leading-none">×</span>
        </button>
      </div>

      {/* Items */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
        {!store.cart || store.cart.length === 0 ? (
          <div className="text-center text-white py-16">
            <p className="text-base sm:text-lg">Tu carrito está vacío</p>
            <button
              onClick={() => (isRouteMode ? navigate("/") : close())}
              className="mt-4 w-full bg-[#232325] text-white px-6 py-3 rounded-lg font-serif tracking-wide hover:bg-black transition-colors"
            >
              Ver más productos
            </button>
          </div>
        ) : (
          <>
            {store.cart.map((item) => {
              const max = (item?.selectedFlavor && Array.isArray(item?.flavor_catalog))
                ? (item.flavor_catalog.find(f => f?.name === item.selectedFlavor)?.stock ?? (Number.isFinite(Number(item?.stock)) ? Number(item.stock) : 0))
                : (Number.isFinite(Number(item?.stock)) ? Number(item.stock) : 0);

              const atLimit = Number(item.quantity || 0) >= Number(max || 0);

              return (
                <div key={`${item.id}-${item.selectedFlavor || 'default'}-${getSelectedMl(item) || 'na'}`} className="rounded-lg border border-gray-200 bg-white p-3 text-gray-900 shadow-sm sm:p-4">
                  <div className="flex gap-3">
                    <img
                      src={toAbsUrl(item?.image_url) || "/sin_imagen.jpg"}
                      alt={getTitle(item)}
                      className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        if (!e.currentTarget.src.endsWith("/sin_imagen.jpg")) {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "/sin_imagen.jpg";
                        }
                      }}
                    />

                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-medium text-sm sm:text-base leading-snug">
                            {getTitle(item)}
                          </h4>
                          <p className="font-semibold text-gray-900">
                            {getItemPrice(item) !== null
                              ? formatCurrency(getItemPrice(item))
                              : "Consultar"}
                          </p>
                          {getSelectedMl(item) && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Tamaño: {getSelectedMl(item)}ml
                            </p>
                          )}

                        </div>
                        <button
                          onClick={() => actions.removeFromCart(item.id, item.selectedFlavor, getSelectedMl(item))}
                          className="text-gray-400 hover:text-gray-700"
                          aria-label="Eliminar producto"
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>

                      {/* Controles de cantidad */}
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              actions.updateCartQuantity(
                                item.id,
                                Math.max(1, (item.quantity || 1) - 1),
                                item.selectedFlavor,
                                getSelectedMl(item)
                              )
                            }
                            aria-label="Disminuir cantidad"
                            className="w-9 h-9 rounded bg-black text-white hover:bg-gray-800 flex items-center justify-center text-lg"
                          >
                            -
                          </button>
                          <span className="min-w-[36px] text-center font-medium text-gray-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => {
                              const next = Math.min((item.quantity || 1) + 1, Number(max || 0));
                              actions.updateCartQuantity(item.id, next, item.selectedFlavor, getSelectedMl(item));
                            }}
                            aria-label="Aumentar cantidad"
                            disabled={atLimit}
                            title={atLimit ? "Sin stock disponible" : "Aumentar cantidad"}
                            className={`w-9 h-9 rounded flex items-center justify-center text-lg text-white ${atLimit ? "bg-black opacity-50 cursor-not-allowed" : "bg-black hover:bg-gray-800"}`}
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right font-semibold text-gray-900">
                          {getItemPrice(item) !== null
                            ? formatCurrency(getItemPrice(item) * Number(item.quantity || 0))
                            : "Consultar"}
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Subtotal */}
        <div className="flex items-center justify-between rounded-lg bg-black/35 px-2 py-2 text-white">
          <span>
            Subtotal <span className="text-sm text-white/70">(sin envío)</span> :
          </span>
          <span className="font-semibold text-white">
            {formatCurrency(total)}
          </span>
        </div>

        {couponEnabled && store.cart && store.cart.length > 0 && (
          <CuponBox
            code={couponCode}
            onCodeChange={(value) => {
              setCouponCode(normalizeCouponCode(value));
              if (appliedCoupon) setAppliedCoupon(null);
              if (couponStatus) setCouponStatus(null);
            }}
            onApply={applyCoupon}
            onClear={clearCoupon}
            appliedCoupon={couponTotals}
            status={couponStatus}
            loading={validatingCoupon}
            subtotal={total}
            pricePrefix={pricePrefix}
          />
        )}




        {/* Nuestro local */}
        {/*  <div>
          <h3 className="font-semibold mb-2">Retiro en nuestro local</h3>
          <label className="flex items-start gap-3 bg-white border rounded-lg p-3 sm:p-4 shadow-sm">
            <input
              type="checkbox"
              checked={pickup}
              className="mt-1 size-4 cart-checkbox"
              onChange={(e) => {
                setPickup(e.target.checked);
                actions.setPickup(e.target.checked);
              }}
            />


            <div className="flex-1">
              <p className="text-sm sm:text-base">
                Local Zarpados - Velez Sarsfield 303
                <span className="block text-gray-500">
                  Lunes a viernes 10:30hs a 13:00hs | 16:00hs a 22:00hs
                  <br />
                  Sábado 13:00hs a 22:00hs | Domingo cerrado
                </span>
              </p>
            </div>
            <span className="text-green-600 font-semibold">Gratis</span>
          </label>
        </div> */}
      </div>

      {/* Footer Totales / Acciones */}
      {store.cart && store.cart.length > 0 && (
        <div className="relative z-10 border-t border-white/50 bg-black/35 p-4 text-white sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xl font-semibold">Total:</span>
            <span className="text-2xl font-semibold text-white font-serif tracking-wide">
              {couponEnabled && couponTotals && (
                <span className="block text-sm font-normal text-white/60 line-through">
                  {formatCurrency(Math.round(total))}
                </span>
              )}
              {formatCurrency(finalTotal)}
            </span>
          </div>

          <button
            onClick={() => setShowCheckout(true)}

            className="w-full bg-[#232325] text-white py-3 rounded-lg font-serif tracking-wide hover:bg-black transition-colors"
          >
            📦 Solicitar Pedido por WhatsApp
          </button>

          <button
            onClick={payWithMercadoPago}
            disabled={payingMercadoPago}
            className="mt-3 w-full border border-[#009ee3] bg-white text-[#075f8f] py-3 rounded-lg font-serif tracking-wide hover:bg-[#eef9ff] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {payingMercadoPago ? (
              <>
                <span className="h-5 w-5 rounded-full border-2 border-[#009ee3] border-t-transparent animate-spin" aria-hidden="true" />
                Redirigiendo a Mercado Pago...
              </>
            ) : (
              <>
                <img src={mercadoPagoLogo} alt="" className="h-6 w-auto" />
                Pagar con Mercado Pago
              </>
            )}
          </button>


          <div className="mt-4 text-center">
            {isRouteMode ? (
            <Link to="/" className="text-white font-serif tracking-wide hover:text-gray-200 transition-colors">
                Ver más productos
              </Link>
            ) : (
              <button
                onClick={close}
                className="bg-transparent border-0 p-0 text-white font-serif tracking-wide hover:bg-transparent hover:text-gray-200 transition-colors"
                style={{ backgroundColor: "transparent" }}
              >
                Ver más productos
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (isRouteMode) {
    return (
      <div className="min-h-screen" style={cartBackgroundStyle}>
        <div className="max-w-lg mx-auto min-h-screen shadow-xl">
          {DrawerContent}
        </div>
      </div>
    );
  }

  const modalUI = (
    <div className={`fixed inset-0 z-[100] ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-500 ease-out ${isOpen ? "opacity-100" : "opacity-0"
          }`}
        onClick={close}
      />
      <aside
        className={`
          absolute right-0 top-0
          h-screen w-full max-w-md md:max-w-lg
          shadow-2xl
          transform transition-transform duration-500 ease-out
          ${controlledOpen ? "translate-x-0" : "translate-x-full"}
          flex flex-col text-gray-900
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
      >
        {DrawerContent}
      </aside>
    </div>
  );



  return createPortal(
    <>
      {modalUI}

      {showCheckout && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200]">
          <div className="bg-white rounded-lg p-6 w-[90%] max-w-md shadow-xl">
            <h2 className="text-2xl font-serif tracking-wide text-gray-900 mb-3 text-center">
              Datos para el pedido
            </h2>
            <div className="w-12 h-[2px] bg-gray-900 mb-6 mx-auto"></div>

            <p className="text-sm text-gray-500 font-serif tracking-wide mb-5">
              Guardamos tus datos para futuras compras.
            </p>

            <input
              type="text"
              name="name"
              placeholder="Nombre y Apellido"
              value={customerData.name}
              onChange={handleCustomerChange}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 font-serif tracking-wide focus:outline-none focus:border-gray-900"
            />

            <input
              type="tel"
              name="phone"
              placeholder="Teléfono"
              value={customerData.phone}
              onChange={handleCustomerChange}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 font-serif tracking-wide focus:outline-none focus:border-gray-900"
            />

            <input
              type="email"
              name="email"
              placeholder="Email para Mercado Pago"
              value={customerData.email}
              onChange={handleCustomerChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 font-serif tracking-wide focus:outline-none focus:border-gray-900"
            />

            <input
              type="text"
              name="zone"
              placeholder="Zona / Localidad"
              value={customerData.zone}
              onChange={handleCustomerChange}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 font-serif tracking-wide focus:outline-none focus:border-gray-900"
            />

            <div className="mb-4">
              <p className="text-sm font-serif tracking-wide mb-3 text-gray-800">Forma de pago</p>

              <div className="space-y-2 text-sm">
                {["Transferencia", "Efectivo", "Coordinar"].map(method => {
                  const selected = customerData.payment === method;

                  return (
                    <label
                      key={method}
                      className={`flex items-center gap-3 cursor-pointer border rounded-md px-3 py-2 transition
     ${selected
                          ? "bg-[#232325] text-white border-black shadow-sm"
                          : "bg-white hover:bg-gray-50 border-gray-300"}
      `}
                    >
                      <input
                        type="radio"
                        name="payment"
                        checked={selected}
                        onChange={() => selectPayment(method)}
                        className="accent-gray-900"
                      />
                      {method}
                    </label>
                  );
                })}

              </div>
            </div>
            <p className="text-sm text-gray-500 font-serif tracking-wide mt-3 mb-5 text-center">
              📦 Envío disponible <br />
              <span className="italic">El costo se coordina con el vendedor.</span>
            </p>


            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCheckout(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-serif tracking-wide hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>

              <button
                onClick={payWithMercadoPago}
                disabled={payingMercadoPago}
                className="px-4 py-2 border border-[#009ee3] text-[#075f8f] rounded-lg font-serif tracking-wide hover:bg-[#eef9ff] transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {payingMercadoPago ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-[#009ee3] border-t-transparent animate-spin" aria-hidden="true" />
                    Redirigiendo...
                  </>
                ) : "Mercado Pago"}
              </button>

              <button
                onClick={sendOrder}
                disabled={sendingOrder}
                className="px-4 py-2 bg-[#232325] text-white rounded-lg font-serif tracking-wide hover:bg-black transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendingOrder ? "Enviando..." : "Enviar pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {whatsappOrderPrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[210]">
          <div className="bg-white rounded-lg p-6 w-[90%] max-w-md shadow-xl">
            <h2 className="text-xl font-serif tracking-wide text-gray-900 mb-3 text-center">
              {whatsappOrderPrompt.status === "failed"
                ? "Error al registrar el pedido"
                : "Pedido Registrado"}
            </h2>
            <p className="text-sm text-gray-500 font-serif tracking-wide mb-5 text-center">
              Si WhatsApp no se abrió, podés abrirlo de nuevo haciendo click en "Abrir WhatsApp".
            </p>

            {whatsappOrderPrompt.status === "saving" && (
              <p className="text-xs text-gray-500 font-serif tracking-wide mb-4 text-center">
                Guardando el pedido en el panel...
              </p>
            )}

            {whatsappOrderPrompt.status === "failed" && (
              <p className="text-xs text-red-600 font-serif tracking-wide mb-4 text-center">
                Hubo un problema al registrar el pedido. Si no llegaste a enviarlo por WhatsApp, intentá nuevamente.
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {/*         <button
                onClick={() => setWhatsappOrderPrompt(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-serif tracking-wide hover:bg-gray-100 transition-colors"
              >
                Volver
              </button> */}
              <button
                onClick={() => openWhatsAppFallbackUrl(whatsappOrderPrompt.fallbackUrl)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-serif tracking-wide hover:bg-gray-100 transition-colors"
              >
                Abrir WhatsApp
              </button>
              <button
                onClick={() => {
                  actions.clearCart?.();
                  clearCoupon();
                  setWhatsappOrderPrompt(null);
                  setShowCheckout(false);
                }}
                className="px-4 py-2 bg-[#232325] text-white rounded-lg font-serif tracking-wide hover:bg-black transition-colors"
              >
                Ya envié el pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );

}
