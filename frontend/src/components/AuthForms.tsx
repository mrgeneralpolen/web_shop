import { useState } from "react";
import { login, register } from "../api";
import type { User } from "../types";

interface Props {
  mode: "login" | "register";
  onMode: (mode: "login" | "register") => void;
  onAuth: (user: User) => void;
  onCancel: () => void;
}

export default function AuthForms({ mode, onMode, onAuth, onCancel }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = "Укажите корректный адрес электронной почты.";
    }
    if (password.length < 6) {
      errs.password = "Пароль должен содержать не менее 6 символов.";
    }
    if (mode === "register") {
      if (name.trim().length < 2) {
        errs.name = "Укажите имя (не короче 2 символов).";
      }
      if (password !== password2) {
        errs.password2 = "Пароли не совпадают.";
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!validate()) {
      setFormError(
        mode === "register"
          ? "Проверьте выделенные поля формы регистрации."
          : "Проверьте выделенные поля формы входа.",
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        const user = await register(name.trim(), email.trim(), password, password2);
        await login(email.trim(), password);
        onAuth(user);
      } else {
        await login(email.trim(), password);
        onAuth({ id: "", email: email.trim(), name: null, phone: null, roles: [] });
      }
    } catch (err) {
      setFormError((err as { detail?: string }).detail ?? "Что-то пошло не так.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "login") {
    return (
      <div className="form-card">
        <h1>Вход в личный кабинет</h1>
        <p className="sub">
          Введите адрес электронной почты и пароль вашей учётной записи.
        </p>
        <form onSubmit={submit} noValidate>
          {formError && <div className="form-error">{formError}</div>}
          <div className="field">
            <label htmlFor="loginEmail">Адрес электронной почты</label>
            <input
              id="loginEmail"
              type="email"
              placeholder="name@example.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            {fieldErrors.email && <div className="err">{fieldErrors.email}</div>}
          </div>
          <div className="field">
            <label htmlFor="loginPass">Пароль</label>
            <input
              id="loginPass"
              type="password"
              placeholder="Ваш пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {fieldErrors.password ? (
              <div className="err">{fieldErrors.password}</div>
            ) : (
              <div className="hint">Введите пароль.</div>
            )}
          </div>
          <button className="btn block" type="submit" disabled={busy}>
            Войти
          </button>
        </form>
        <p className="form-link">
          Нет учётной записи?{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onMode("register");
            }}
          >
            Зарегистрироваться
          </a>
        </p>
        <p className="form-link">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onCancel();
            }}
          >
            Вернуться в каталог
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="form-card">
      <h1>Регистрация</h1>
      <p className="sub">
        Создайте учётную запись, чтобы делать заказы и отслеживать их в личном
        кабинете.
      </p>
      <form onSubmit={submit} noValidate>
        {formError && <div className="form-error">{formError}</div>}
        <div className="field">
          <label htmlFor="regName">Имя</label>
          <input
            id="regName"
            placeholder="Как к вам обращаться"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
          {fieldErrors.name && <div className="err">{fieldErrors.name}</div>}
        </div>
        <div className="field">
          <label htmlFor="regEmail">Адрес электронной почты</label>
          <input
            id="regEmail"
            type="email"
            placeholder="name@example.ru"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {fieldErrors.email && <div className="err">{fieldErrors.email}</div>}
        </div>
        <div className="field">
          <label htmlFor="regPass">Пароль</label>
          <input
            id="regPass"
            type="password"
            placeholder="Не короче 6 символов"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.password && (
            <div className="err">{fieldErrors.password}</div>
          )}
        </div>
        <div className="field">
          <label htmlFor="regPass2">Повторите пароль</label>
          <input
            id="regPass2"
            type="password"
            placeholder="Ещё раз тот же пароль"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
          {fieldErrors.password2 && (
            <div className="err">{fieldErrors.password2}</div>
          )}
        </div>
        <button className="btn block" type="submit" disabled={busy}>
          Зарегистрироваться
        </button>
      </form>
      <p className="form-link">
        Уже зарегистрированы?{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onMode("login");
          }}
        >
          Войти
        </a>
      </p>
    </div>
  );
}
