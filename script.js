
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const photoInput = $("photoInput");
  const cameraInput = $("cameraInput");
  const dropZone = $("dropZone");
  const photoGrid = $("photoGrid");
  const editor = $("editor");
  const photoCount = $("photoCount");
  const convertBtn = $("convertBtn");
  const status = $("status");

  const photos = [];
  let nextId = 1;
  let draggedId = null;

  let currentPdfBlob = null;
  let currentPdfUrl = null;
  let currentPdfFilename = "my-photos.pdf";

  $("year").textContent = new Date().getFullYear();

  // Create the Share / Save button.
  const savePdfBtn = document.createElement("button");
  savePdfBtn.type = "button";
  savePdfBtn.id = "savePdfBtn";
  savePdfBtn.className = "btn btn-primary convert-btn hidden";
  savePdfBtn.textContent = "Share / Save PDF";
  savePdfBtn.disabled = true;

  convertBtn.insertAdjacentElement("afterend", savePdfBtn);

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = "status" + (type ? " " + type : "");
  }

  function isAppleMobile() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" &&
        navigator.maxTouchPoints > 1);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function safeFilename(value) {
    const cleaned = value.trim()
      .replace(/\.pdf$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

    return cleaned || "my-photos";
  }

  function makeButton(text, label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.title = label;
    return button;
  }

  // Render uploaded photos.
  function render() {
    photoGrid.replaceChildren();

    photos.forEach((photo, index) => {
      const card = document.createElement("article");
      card.className = "photo-card";
      card.draggable = true;
      card.dataset.id = String(photo.id);

      card.setAttribute(
        "aria-label",
        `Photo ${index + 1}: ${photo.file.name}`
      );

      const previewWrap = document.createElement("div");
      previewWrap.className = "photo-preview-wrap";

      const image = document.createElement("img");
      image.className = "photo-preview";
      image.src = photo.url;
      image.alt = photo.file.name;

      const number = document.createElement("span");
      number.className = "page-number";
      number.textContent = String(index + 1);

      previewWrap.append(image, number);

      const meta = document.createElement("div");
      meta.className = "photo-meta";

      const name = document.createElement("div");
      name.className = "photo-name";
      name.textContent = photo.file.name;
      name.title = photo.file.name;

      const size = document.createElement("div");
      size.className = "photo-size";
      size.textContent = formatBytes(photo.file.size);

      meta.append(name, size);

      const controls = document.createElement("div");
      controls.className = "photo-controls";

      const up = makeButton("↑", "Move photo up", "icon-button");
      up.disabled = index === 0;
      up.addEventListener("click", () => movePhoto(index, index - 1));

      const down = makeButton("↓", "Move photo down", "icon-button");
      down.disabled = index === photos.length - 1;
      down.addEventListener("click", () => movePhoto(index, index + 1));

      const remove = makeButton("×", "Remove photo", "icon-button remove");
      remove.addEventListener("click", () => removePhoto(photo.id));

      controls.append(up, down, remove);
      card.append(previewWrap, meta, controls);

      // Drag and drop reordering.
      card.addEventListener("dragstart", (event) => {
        draggedId = photo.id;
        card.classList.add("dragging");

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(photo.id));
        }
      });

      card.addEventListener("dragend", () => {
        draggedId = null;
        card.classList.remove("dragging");

        photoGrid.querySelectorAll(".drag-target").forEach((el) => {
          el.classList.remove("drag-target");
        });
      });

      card.addEventListener("dragover", (event) => {
        event.preventDefault();

        if (draggedId !== null && draggedId !== photo.id) {
          card.classList.add("drag-target");
        }
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-target");
      });

      card.addEventListener("drop", (event) => {
        event.preventDefault();
        card.classList.remove("drag-target");

        const from = photos.findIndex((item) => item.id === draggedId);
        const to = photos.findIndex((item) => item.id === photo.id);

        if (from >= 0 && to >= 0 && from !== to) {
          const [item] = photos.splice(from, 1);
          photos.splice(to, 0, item);
          render();
        }
      });

      photoGrid.append(card);
    });

    const count = photos.length;

    photoCount.textContent =
      `${count} photo${count === 1 ? "" : "s"}`;

    editor.classList.toggle("hidden", count === 0);
    convertBtn.disabled = count === 0;

    if (count === 0) {
      setStatus("Add at least one photo to get started.");
    } else {
      setStatus(
        `${count} photo${count === 1 ? "" : "s"} ready to convert.`
      );
    }
  }

  function movePhoto(from, to) {
    if (to < 0 || to >= photos.length) return;

    const [photo] = photos.splice(from, 1);
    photos.splice(to, 0, photo);
    render();
  }

  function removePhoto(id) {
    const index = photos.findIndex((photo) => photo.id === id);
    if (index < 0) return;

    URL.revokeObjectURL(photos[index].url);
    photos.splice(index, 1);
    render();
  }

  // Upload and read images.
  async function addFiles(fileList) {
    const files = Array.from(fileList || []);

    const imageFiles = files.filter((file) =>
      file.type.startsWith("image/")
    );

    const rejected = files.length - imageFiles.length;
    let added = 0;

    for (const file of imageFiles) {
      let url;

      try {
        url = URL.createObjectURL(file);

        const image = new Image();
        image.src = url;

        await image.decode();

        if (!image.naturalWidth || !image.naturalHeight) {
          throw new Error("Invalid image");
        }

        photos.push({
          id: nextId++,
          file,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight
        });

        added++;

      } catch (error) {
        if (url) URL.revokeObjectURL(url);

        console.error(error);

        setStatus(
          `Could not read "${file.name}". Try another image format.`,
          "error"
        );
      }
    }

    render();

    if (added && rejected) {
      setStatus(
        `${added} image(s) added. ${rejected} non-image file(s) skipped.`,
        "success"
      );
    } else if (added) {
      setStatus(
        `${added} image${added === 1 ? "" : "s"} added successfully.`,
        "success"
      );
    } else if (rejected && imageFiles.length === 0) {
      setStatus("Please choose image files only.", "error");
    }
  }

  // IMPORTANT: Upload button listeners are registered separately.
  $("chooseBtn").addEventListener("click", () => {
    photoInput.click();
  });

  $("cameraBtn").addEventListener("click", () => {
    cameraInput.click();
  });

  photoInput.addEventListener("change", async () => {
    await addFiles(photoInput.files);
    photoInput.value = "";
  });

  cameraInput.addEventListener("change", async () => {
    await addFiles(cameraInput.files);
    cameraInput.value = "";
  });

  // Remove all photos.
  $("clearBtn").addEventListener("click", () => {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    photos.length = 0;
    render();
  });

  // Drag photos into the upload area.
  ["dragenter", "dragover"].forEach((type) => {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    dropZone.addEventListener(type, (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    if (files?.length) addFiles(files);
  });

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);

      image.onerror = () => {
        reject(
          new Error("Unable to load one of the selected photos.")
        );
      };

      image.src = src;
    });
  }

  function imageToJpeg(image, quality) {
    const canvas = document.createElement("canvas");

    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Your browser could not prepare an image.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const data = canvas.toDataURL("image/jpeg", quality);

    canvas.width = 0;
    canvas.height = 0;

    return data;
  }

  // Normal PC and Android download.
  function downloadPdf() {
    if (!currentPdfBlob || !currentPdfUrl) return;

    const link = document.createElement("a");

    link.href = currentPdfUrl;
    link.download = currentPdfFilename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setStatus("Your PDF download has started.", "success");
  }

  // iPhone and iPad Share / Save.
  savePdfBtn.addEventListener("click", async () => {
    if (!currentPdfBlob) return;

    const file = new File(
      [currentPdfBlob],
      currentPdfFilename,
      { type: "application/pdf" }
    );

    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: currentPdfFilename,
          text: "Created with Photo2PDF"
        });

        setStatus(
          "Share menu opened. Choose Save to Files to keep your PDF.",
          "success"
        );

      } catch (error) {
        if (error.name === "AbortError") {
          setStatus("Sharing cancelled. Your PDF is still ready.");
        } else {
          console.error(error);

          setStatus(
            "Sharing unavailable. Opening your PDF instead.",
            "error"
          );

          window.open(currentPdfUrl, "_blank");
        }
      }

    } else {
      const opened = window.open(currentPdfUrl, "_blank");

      if (opened) {
        setStatus(
          "PDF opened. Use the Share button and choose Save to Files.",
          "success"
        );
      } else {
        setStatus(
          "Allow pop-ups, then tap Share / Save PDF again.",
          "error"
        );
      }
    }
  });

  // CREATE PDF — only one conversion listener.
  convertBtn.addEventListener("click", async () => {
    if (!photos.length) return;

    if (!window.jspdf?.jsPDF) {
      setStatus(
        "PDF library could not load. Check your internet connection and reload.",
        "error"
      );
      return;
    }

    const originalLabel = convertBtn.innerHTML;

    convertBtn.disabled = true;
    savePdfBtn.classList.add("hidden");
    savePdfBtn.disabled = true;

    convertBtn.textContent = "Preparing your PDF…";
    setStatus("Converting photos on your device. Please wait.");

    try {
      const { jsPDF } = window.jspdf;

      const size = $("pageSize").value;
      const orientation = $("orientation").value;
      const quality = Number($("imageQuality").value);

      let pdf = null;

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];

        setStatus(
          `Processing photo ${i + 1} of ${photos.length}…`
        );

        const image = await loadImage(photo.url);
        const jpeg = imageToJpeg(image, quality);

        if (size === "fit") {
          const width = image.naturalWidth * 0.264583;
          const height = image.naturalHeight * 0.264583;

          if (!pdf) {
            pdf = new jsPDF({
              orientation: width > height ? "landscape" : "portrait",
              unit: "mm",
              format: [width, height],
              compress: true
            });
          } else {
            pdf.addPage(
              [width, height],
              width > height ? "landscape" : "portrait"
            );
          }

          pdf.addImage(
            jpeg, "JPEG", 0, 0, width, height, undefined, "FAST"
          );

        } else {
          const format = size === "letter" ? "letter" : "a4";

          if (!pdf) {
            pdf = new jsPDF({
              orientation,
              unit: "mm",
              format,
              compress: true
            });
          } else {
            pdf.addPage(format, orientation);
          }

          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();

          const margin = 8;
          const maxWidth = pageWidth - margin * 2;
          const maxHeight = pageHeight - margin * 2;

          const scale = Math.min(
            maxWidth / image.naturalWidth,
            maxHeight / image.naturalHeight
          );

          const drawWidth = image.naturalWidth * scale;
          const drawHeight = image.naturalHeight * scale;

          const x = (pageWidth - drawWidth) / 2;
          const y = (pageHeight - drawHeight) / 2;

          pdf.addImage(
            jpeg,
            "JPEG",
            x,
            y,
            drawWidth,
            drawHeight,
            undefined,
            "FAST"
          );
        }
      }

      if (!pdf) {
        throw new Error("No photos were available to convert.");
      }

      // Create the PDF as a browser Blob.
      currentPdfBlob = pdf.output("blob");
      currentPdfFilename =
        `${safeFilename($("pdfName").value)}.pdf`;

      if (currentPdfUrl) {
        URL.revokeObjectURL(currentPdfUrl);
      }

      currentPdfUrl = URL.createObjectURL(currentPdfBlob);

      savePdfBtn.classList.remove("hidden");
      savePdfBtn.disabled = false;

      if (isAppleMobile()) {
        savePdfBtn.textContent = "Share / Save PDF";

        setStatus(
          `PDF created successfully! ${photos.length} page(s). Tap Share / Save PDF, then choose Save to Files.`,
          "success"
        );

      } else {
        savePdfBtn.textContent = "Download PDF again";
        downloadPdf();

        setStatus(
          `Success! Your PDF contains ${photos.length} page(s).`,
          "success"
        );
      }

    } catch (error) {
      console.error(error);

      setStatus(
        error?.message ||
        "Something went wrong. Try fewer or smaller photos.",
        "error"
      );

    } finally {
      convertBtn.disabled = photos.length === 0;
      convertBtn.innerHTML = originalLabel;
    }
  });

  // Release the generated PDF URL when leaving the page.
  window.addEventListener("beforeunload", () => {
    if (currentPdfUrl) {
      URL.revokeObjectURL(currentPdfUrl);
    }

    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
  });

  // Initial setup.
  render();

})();
