import React, { useEffect, useRef, useState } from "react";
import { storeConfig } from "../config/storeConfig";

const getPublicMediaUrl = (path = "") => {
    if (!path) return "";
    if (/^(https?:)?\/\//.test(path) || path.startsWith("data:") || path.startsWith("/")) {
        return path;
    }

    return `/${path}`;
};

const GlobalSpinner = ({ appReady = false }) => {
    const [visible, setVisible] = useState(true);
    const spinnerImgRef = useRef(null);
    const spinnerSrc = getPublicMediaUrl(storeConfig.media.globalSpinnerGif);

    useEffect(() => {
        if (!appReady) {
            setVisible(true);
            return;
        }

        let cancelled = false;
        let pollTimeout = null;
        let fallbackTimeout = null;

        const checkImages = () => {
            if (cancelled) return;

            const images = Array.from(document.images).filter(
                (img) => img !== spinnerImgRef.current
            );

            const allLoaded = images.every((img) => img.complete);

            if (allLoaded) {
                setTimeout(() => {
                    if (!cancelled) setVisible(false);
                }, 250);
                return;
            }

            pollTimeout = window.setTimeout(checkImages, 120);
        };

        fallbackTimeout = window.setTimeout(() => {
            if (!cancelled) setVisible(false);
        }, 8000);

        requestAnimationFrame(checkImages);

        return () => {
            cancelled = true;
            if (pollTimeout) window.clearTimeout(pollTimeout);
            if (fallbackTimeout) window.clearTimeout(fallbackTimeout);
        };
    }, [appReady]);

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white">
            <img ref={spinnerImgRef} src={spinnerSrc} alt="Loading" className="w-54 h-54" />
        </div>
    );
};

export default GlobalSpinner;
