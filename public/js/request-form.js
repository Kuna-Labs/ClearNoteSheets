// Request form: validates in the browser, then posts to the Pages Function at /api/request,
// which stores the file in R2, saves the request in Supabase and sends emails through Resend.
(function () {
  var form = document.querySelector("[data-request-form]");
  if (!form) return;

  var MAX_BYTES = 20 * 1024 * 1024;
  var status = form.querySelector("[data-form-status]");
  var submit = form.querySelector('button[type="submit"]');

  function setStatus(text, state) {
    status.textContent = text;
    if (state) status.setAttribute("data-state", state);
    else status.removeAttribute("data-state");
  }

  function markInvalid(field, invalid) {
    if (invalid) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }

  function validate() {
    var firstBad = null;
    var message = "";
    form.querySelectorAll("input[required], textarea[required]").forEach(function (field) {
      var bad = !field.value.trim() || (field.type === "email" && !field.checkValidity());
      markInvalid(field, bad);
      if (bad && !firstBad) {
        firstBad = field;
        message = field.type === "email" && field.value.trim()
          ? "Enter an email address like name@example.com."
          : (field.dataset.missing || "Fill in the highlighted field.");
      }
    });

    var file = form.querySelector('input[type="file"]');
    if (!firstBad && file && file.files[0] && file.files[0].size > MAX_BYTES) {
      markInvalid(file, true);
      firstBad = file;
      message = "That file is over 20 MB. Send a shorter clip or a link in the details instead.";
    } else if (file) {
      markInvalid(file, false);
    }

    if (firstBad) {
      firstBad.focus();
      setStatus(message, "error");
      return false;
    }
    return true;
  }

  form.addEventListener("input", function (e) {
    if (e.target.getAttribute("aria-invalid")) markInvalid(e.target, false);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) return;

    submit.disabled = true;
    setStatus("Sending your request…");

    fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || !data.ok) throw new Error(data.error || "The request didn’t go through. Try again in a minute.");
          return data;
        });
      })
      .then(function () {
        form.reset();
        setStatus("Request sent. Check your inbox for a confirmation.", "success");
      })
      .catch(function (err) {
        var msg = err instanceof TypeError
          ? "Couldn’t reach the server. Check your connection and try again."
          : err.message;
        setStatus(msg, "error");
      })
      .finally(function () {
        submit.disabled = false;
      });
  });
})();
