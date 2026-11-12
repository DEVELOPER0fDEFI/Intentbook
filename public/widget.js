(function () {
  var script = document.currentScript;
  if (!script || !script.parentNode) return;
  var referrer = script.getAttribute("data-referrer") || "";
  var origin = script.getAttribute("data-origin") || new URL(script.src, window.location.href).origin;
  var frame = document.createElement("iframe");
  frame.title = "IntentBook";
  frame.src = origin.replace(/\/$/, "") + "/embed?referrer=" + encodeURIComponent(referrer);
  frame.style.width = "100%";
  frame.style.minHeight = "780px";
  frame.style.border = "0";
  script.parentNode.insertBefore(frame, script);
})();
