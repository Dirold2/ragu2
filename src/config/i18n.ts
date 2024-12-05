import i18next from "i18next";
import Backend from "i18next-fs-backend";

i18next.use(Backend).init({
    lng: "en", // Язык по умолчанию
    fallbackLng: "en", // Резервный язык
    preload: ["en", "ru"], // Загружаемые языки
    backend: {
        loadPath: "./locales/{{lng}}.json", // Путь к файлам переводов
    },
});

export default i18next;
