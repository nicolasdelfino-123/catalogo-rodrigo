import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { formatPrice } from "../utils/price.js";
import { Context } from '../js/store/appContext.jsx';
import sinImagen from '@/assets/sin_imagen.jpg'
import { getCategorySlugFromName, getDisplayCategoryName } from "../utils/perfumeCategories.js";


// --- helpers de sabores ---
const normalizeFlavor = (s) =>
    s.replace(/\s+/g, ' ').trim().replace(/^[-•·]+/, '').trim();

const extractFlavorsFromDescription = (txt = '') => {
    const m = txt.match(/sabor\s*:\s*(.+)$/i);
    if (!m) return [];
    const parts = m[1].split(/,|\||\/|\n/);
    const flavors = parts
        .map(normalizeFlavor)
        .filter(Boolean)
        .filter((f) => !/^peso\b|^dimensiones\b/i.test(f));
    return [...new Set(flavors)];
};

/**
 * Obtiene sabores disponibles, filtrando los que estén sin stock.
 */
const getFlavors = (product) => {
    if (!product) return [];

    // Si viene flavor_catalog (estructura recomendada)
    if (Array.isArray(product.flavor_catalog) && product.flavor_catalog.length) {
        return product.flavor_catalog
            .filter(f => (f.stock ?? 0) > 0)       // 👈 solo con stock > 0
            .map(f => f.name);
    }

    // Fallback a flavors plano o extraído de descripción
    if (Array.isArray(product?.flavors) && product.flavors.length)
        return product.flavors;

    return extractFlavorsFromDescription(product?.description || '');
};


const API = import.meta.env.VITE_BACKEND_URL?.replace(/\/+$/, "") || "";

// Normaliza paths viejos
const normalizeImagePath = (u = "") => {
    if (!u) return "";
    // corrige cosas antiguas
    if (u.startsWith("/admin/uploads/")) u = u.replace("/admin", "/public");
    if (u.startsWith("/uploads/")) u = `/public${u}`; // si alguna vez vino sin /public
    return u;
};

// Debe quedar exactamente así:
// Debe quedar así en ProductDetail.jsx
const toAbsUrl = (u = "") => {
    u = normalizeImagePath(u);
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;        // URL externa OK

    // Solo assets del backend se sirven con API
    if (u.startsWith("/public/")) return `${API}${u}`;

    // Rutas del frontend (ej: "/sin_imagen.jpg") se dejan tal cual
    if (u.startsWith("/")) return u;

    // Relativo raro -> asumimos backend
    return `${API}/${u}`;
};

const sanitizeRichHtml = (html = "") => {
    const source = String(html || "");
    if (!source.trim()) return "";
    const parser = new DOMParser();
    const parsed = parser.parseFromString(source, "text/html");
    const allowed = new Set(["STRONG", "EM", "B", "I", "U", "BR", "P", "DIV", "UL", "OL", "LI"]);

    const walk = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
        if (node.nodeType !== Node.ELEMENT_NODE) return "";
        const tag = node.tagName.toUpperCase();
        const children = Array.from(node.childNodes).map(walk).join("");
        if (tag === "BR") return "<br>";
        if (!allowed.has(tag)) return children;
        if (tag === "B") return `<strong>${children}</strong>`;
        if (tag === "I") return `<em>${children}</em>`;
        return `<${tag.toLowerCase()}>${children}</${tag.toLowerCase()}>`;
    };

    return Array.from(parsed.body.childNodes).map(walk).join("");
};

const plainTextFromRich = (html = "") =>
    String(html || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const ProductDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { store, actions } = useContext(Context);
    const product = store.products?.find((p) => p.id === parseInt(id));

    const [quantity, setQuantity] = useState(1);
    const [selectedFlavor, setSelectedFlavor] = useState('');
    const [activeTab, setActiveTab] = useState('desc'); // 'desc' | 'info'
    const [flavorError, setFlavorError] = useState('');
    const [descExpanded, setDescExpanded] = useState(false);
    const location = useLocation();


    // Galería (usa image_urls si vienen; si no, cae a image_url o placeholder)
    const gallery = Array.isArray(product?.image_urls) && product.image_urls.length
        ? product.image_urls
        : (product?.image_url ? [product.image_url] : [sinImagen]);

    const [activeImg, setActiveImg] = useState(gallery[0]);

    // 🔥 NUEVO: Scroll hacia arriba al montar el componente
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [id]); // Se ejecuta cada vez que cambia el ID del producto

    useEffect(() => {
        // cuando cambia el producto, resetea la activa
        setActiveImg(gallery[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product?.id]);

    useEffect(() => {
        if (!store.products || store.products.length === 0) {
            actions?.fetchProducts?.();
        }
    }, []);

    // Calcular opciones de sabor de forma segura
    const flavorOptions = getFlavors(product);

    // Helper para stock por sabor
    const getFlavorStock = (flavor) => {
        if (!product || !Array.isArray(product.flavor_catalog)) return null;
        const found = product.flavor_catalog.find(f => f.name === flavor);
        return found ? found.stock : null;
    };

    const getMaxStock = () => {
        if (selectedFlavor && Array.isArray(product.flavor_catalog)) {
            const found = product.flavor_catalog.find(f => f.name === selectedFlavor);
            if (found && typeof found.stock === 'number') return found.stock;
        }
        return product.stock;
    };

    // Agregar esta función helper después de getMaxStock
    const getAvailableStock = () => {
        const flavorKey = selectedFlavor || '';
        const inCart = (store.cart || []).find(
            item => item.id === product.id && (item.selectedFlavor || '') === flavorKey
        );
        const alreadyInCart = inCart ? inCart.quantity : 0;
        return getMaxStock() - alreadyInCart;
    };

    const handleAddToCart = () => {
        if (flavorOptions.length > 0 && !selectedFlavor) {
            setFlavorError('Elegí un sabor antes de agregar al carrito');
            return;
        }

        // Calcular cuánto ya hay en carrito para este producto/sabor
        const flavorKey = selectedFlavor || '';
        const inCart = (store.cart || []).find(
            item => item.id === product.id && (item.selectedFlavor || '') === flavorKey
        );
        const alreadyInCart = inCart ? inCart.quantity : 0;

        const maxStock = getMaxStock();
        const availableToAdd = maxStock - alreadyInCart;

        if (availableToAdd <= 0) {
            setFlavorError(`Ya tenés el stock máximo de este producto en el carrito (${maxStock} unidades)`);
            return;
        }

        if (quantity > availableToAdd) {
            setFlavorError(`Solo podés agregar ${availableToAdd} unidades más (ya tenés ${alreadyInCart} en el carrito)`);
            return;
        }

        if (actions && actions.addToCart && product) {
            const productWithFlavor = selectedFlavor ? { ...product, selectedFlavor } : product;
            actions.addToCart(productWithFlavor, quantity);
        }

    };

    const isWholesale = location.pathname.startsWith("/mayorista");
    const prefix = isWholesale ? "/mayorista" : "";

    const handleBackToProducts = () => {
        // si venís de categoría
        if (location.state?.fromCategory) {
            navigate(`${prefix}/categoria/${location.state.fromCategory}`);
            return;
        }

        // fallback con categoría del producto
        if (product?.category_name && typeof product.category_name === 'string') {
            const slug = getCategorySlugFromName(product.category_name);
            if (slug) {
                navigate(`${prefix}/categoria/${slug}`);
                return;
            }
        }

        // fallback final
        navigate(`${prefix}/products`);
    };


    // Destino de "Volver": categoría si existe, sino /products
    const backCategorySlug = getCategorySlugFromName(product?.category_name);
    const backHref =
        backCategorySlug
            ? `/categoria/${backCategorySlug}`
            : '/products';

    if (!product) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Producto no encontrado</h2>
                    <button
                        onClick={handleBackToProducts}
                        className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                    >
                        Volver a productos
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Botón volver */}
                <button
                    onClick={handleBackToProducts}
                    className="relative z-50 pointer-events-auto mb-6 flex items-center text-purple-600 hover:text-purple-700 transition-colors"
                >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Volver
                </button>


                <div className="bg-white rounded-lg shadow-lg">
                    <div className="grid md:grid-cols-2 gap-8 p-8">

                        <div className="md:pr-4">
                            <img
                                src={toAbsUrl(activeImg) || sinImagen}
                                alt={product?.name || 'Producto'}
                                decoding="async"
                                fetchpriority="high"
                                className="block w-full h-auto rounded-lg bg-gray-100"
                                onError={(e) => { e.currentTarget.src = sinImagen }}
                            />

                            {gallery.length > 1 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {gallery.map((u, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setActiveImg(u)}
                                            className={`border rounded p-0.5 ${activeImg === u ? 'ring-2 ring-purple-500' : ''}`}
                                            title="Ver imagen"
                                        >
                                            <img
                                                src={toAbsUrl(u)}
                                                alt=""
                                                className="w-16 h-16 object-contain"
                                                loading="lazy"
                                                onError={(e) => { e.currentTarget.src = sinImagen }}
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Detalles del producto */}
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-4">{product.name}</h1>

                            {product.brand && (
                                <p className="text-lg text-purple-600 mb-4">Marca: {product.brand}</p>
                            )}

                            <div className="mb-6">
                                {isWholesale ? (
                                    product.price_wholesale > 0 ? (
                                        <>
                                            <span className="text-4xl font-bold text-purple-600">
                                                ${formatPrice(product.price_wholesale)}
                                            </span>
                                            <div className="text-xs text-gray-500 mt-1">
                                                Precio mayorista
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-sm text-gray-400 italic">
                                            Consultar
                                        </span>
                                    )
                                ) : (
                                    <span className="text-4xl font-bold text-purple-600">
                                        ${formatPrice(product.price)}
                                    </span>
                                )}
                            </div>

                            <div className="mb-6">
                                <p className="text-sm text-gray-500">Categoría: {getDisplayCategoryName(product)}</p>
                            </div>

                            {product.description && (
                                <div className="mt-3">
                                    <h3 className="text-sm font-medium text-gray-700 mb-1">Descripción</h3>
                                    <div
                                        className="text-gray-700 whitespace-pre-wrap"
                                        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(product.description) }}
                                    />
                                </div>
                            )}

                            {/* Sabor (solo si hay sabores detectados) */}
                            {flavorOptions.length > 0 && (
                                <div className="mb-4">
                                    <label className="mb-1 block text-sm font-medium">Sabor</label>
                                    <select
                                        className={`w-full rounded border px-3 py-2 ${flavorError ? 'border-red-500 ring-1 ring-red-300' : 'border-gray-300'
                                            }`}
                                        value={selectedFlavor}
                                        onChange={(e) => {
                                            setSelectedFlavor(e.target.value);
                                            if (flavorError) setFlavorError('');
                                        }}
                                    >
                                        <option value="">Seleccionar sabor…</option>
                                        {flavorOptions.map((f) => (
                                            <option key={f} value={f}>
                                                {f}
                                            </option>
                                        ))}
                                    </select>
                                    {flavorError && <p className="mt-1 text-xs text-red-600">{flavorError}</p>}
                                </div>
                            )}

                            {/* Cantidad y agregar al carrito */}
                            <div className="flex items-center space-x-4 mb-6">
                                <div className="flex items-center border border-gray-300 rounded-lg">
                                    <button
                                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                        className="px-3 py-2 text-gray-600 hover:text-gray-800"
                                    >
                                        -
                                    </button>
                                    <span className="px-4 py-2 font-medium">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(Math.min(getAvailableStock(), quantity + 1))}
                                        disabled={quantity >= getAvailableStock()}
                                        className="px-3 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        +
                                    </button>
                                </div>

                                <button
                                    onClick={handleAddToCart}
                                    disabled={
                                        getAvailableStock() <= 0 ||
                                        (flavorOptions.length > 0 && !selectedFlavor) ||
                                        quantity > getAvailableStock()
                                    }
                                    className="flex-1 bg-purple-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {getAvailableStock() <= 0 ? 'Sin stock disponible' : 'Agregar al carrito'}
                                </button>
                            </div>

                            {/* Pestañas: Descripción / Información adicional */}
                            <div className="mt-4">
                                <div className="flex gap-4 border-b">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('desc')}
                                        className={`px-3 py-2 -mb-px border-b-2 ${activeTab === 'desc'
                                            ? 'border-purple-600 text-purple-700 font-semibold'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        Descripción
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('info')}
                                        className={`px-3 py-2 -mb-px border-b-2 ${activeTab === 'info'
                                            ? 'border-purple-600 text-purple-700 font-semibold'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        Información adicional
                                    </button>
                                </div>

                                {/* Contenido de pestañas */}
                                {activeTab === 'desc' ? (
                                    <div className="pt-4">
                                        <div className="relative">
                                            <div
                                                className={`text-gray-700 whitespace-pre-line`}
                                                style={
                                                    descExpanded
                                                        ? { maxHeight: 'none', overflow: 'visible', display: 'block' }
                                                        : { maxHeight: '12em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 8, WebkitBoxOrient: 'vertical' }
                                                }
                                                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(product.short_description || "Sin descripción.") }}
                                            >
                                            </div>
                                            {(plainTextFromRich(product.short_description).length ?? 0) > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDescExpanded((v) => !v)}
                                                    className="mt-2 text-purple-600 hover:text-purple-800 text-sm flex items-center gap-1"
                                                >
                                                    {descExpanded ? (
                                                        <>
                                                            Ver menos
                                                            <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </>
                                                    ) : (
                                                        <>
                                                            Ver más
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="pt-4 space-y-3">
                                        {getFlavors(product).length > 0 ? (
                                            <div>
                                                <h4 className="font-medium mb-2">Sabores disponibles</h4>
                                                <ul className="list-disc pl-5 space-y-1 text-gray-700">
                                                    {getFlavors(product).map((f) => (
                                                        <li key={f}>{f}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : (
                                            <p className="text-gray-500">Sin sabores especificados.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductDetail;
