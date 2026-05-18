import { storeConfig } from "../config/storeConfig";

export const DEFAULT_CATEGORY_ID = 1;

// Contrato técnico de categorías: estos IDs son los que viajan como category_id a la DB.
// Los nombres visibles se configuran desde storeConfig.catalog.categories.
const PERFUME_CATEGORY_ID_DEFINITIONS = [
    { id: 1, fallbackName: "Masculinos", slug: "masculinos" },
    { id: 2, fallbackName: "Femeninos", slug: "femeninos" },
];

const slugifyCategoryLabel = (value = "") =>
    String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const normalizeCategoryLabel = (value = "") =>
    String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

const baseDefinitionById = Object.fromEntries(
    PERFUME_CATEGORY_ID_DEFINITIONS.map((category) => [category.id, category])
);

const configuredCategories = Array.isArray(storeConfig.catalog?.categories)
    ? storeConfig.catalog.categories
    : [];

const configuredDefinitions = configuredCategories
    .map((category) => {
        const id = Number(category?.id);
        if (!Number.isFinite(id)) return null;

        const base = baseDefinitionById[id];
        const name = String(category?.label || base?.fallbackName || `Categoría ${id}`).trim();
        const slug = String(category?.slug || base?.slug || slugifyCategoryLabel(name) || `categoria-${id}`).trim();

        return {
            id,
            name,
            slug,
            fallbackName: base?.fallbackName || name,
        };
    })
    .filter(Boolean);

export const PERFUME_CATEGORY_DEFINITIONS = configuredDefinitions.length
    ? configuredDefinitions
    : PERFUME_CATEGORY_ID_DEFINITIONS.map((category) => ({
        id: category.id,
        name: category.fallbackName,
        slug: category.slug,
        fallbackName: category.fallbackName,
    }));

export const PERFUME_CATEGORY_NAMES = PERFUME_CATEGORY_DEFINITIONS.map((category) => category.name);

export const CATEGORY_ID_TO_NAME = Object.fromEntries(
    PERFUME_CATEGORY_DEFINITIONS.map((category) => [category.id, category.name])
);

export const CATEGORY_NAME_TO_ID = Object.fromEntries(
    PERFUME_CATEGORY_DEFINITIONS.map((category) => [category.name, category.id])
);

export const SLUG_TO_NAME = Object.fromEntries(
    PERFUME_CATEGORY_DEFINITIONS.map((category) => [category.slug, category.name])
);

export const SLUG_TO_ID = Object.fromEntries(
    PERFUME_CATEGORY_DEFINITIONS.map((category) => [category.slug, category.id])
);

export const NAME_TO_SLUG = Object.fromEntries(
    PERFUME_CATEGORY_DEFINITIONS.map((category) => [category.name, category.slug])
);

const LEGACY_NAME_TO_SLUG = Object.fromEntries(
    PERFUME_CATEGORY_DEFINITIONS.flatMap((category) => [
        [category.name, category.slug],
        [category.fallbackName, category.slug],
    ])
);

const NORMALIZED_NAME_TO_ID = Object.fromEntries(
    PERFUME_CATEGORY_DEFINITIONS.flatMap((category) => [
        [normalizeCategoryLabel(category.name), category.id],
        [normalizeCategoryLabel(category.fallbackName), category.id],
    ])
);

export const mapCategoryIdFromName = (value = "") => {
    const normalized = normalizeCategoryLabel(value);
    return NORMALIZED_NAME_TO_ID[normalized] || DEFAULT_CATEGORY_ID;
};

export const getNormalizedCategoryId = (product) => {
    const id = Number(product?.category_id);
    if (CATEGORY_ID_TO_NAME[id]) return id;

    const byName = mapCategoryIdFromName(product?.category_name);
    return byName || DEFAULT_CATEGORY_ID;
};

export const getDisplayCategoryName = (product) => {
    const normalizedId = getNormalizedCategoryId(product);
    return CATEGORY_ID_TO_NAME[normalizedId] || CATEGORY_ID_TO_NAME[DEFAULT_CATEGORY_ID];
};

export const getCategorySlugFromName = (value = "") =>
    LEGACY_NAME_TO_SLUG[String(value || "").trim()] || NAME_TO_SLUG[String(value || "").trim()];
