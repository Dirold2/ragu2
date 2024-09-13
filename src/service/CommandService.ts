import { CommandInteraction, Message, DiscordAPIError, InteractionResponse, CacheType } from "discord.js";

export class CommandService {
    // Отправка или редактирование ответа на взаимодействие
    async sendReply(interaction: CommandInteraction<CacheType>, message: string, ephemeral: boolean = true): Promise<InteractionResponse<boolean> | Message<boolean> | void> {
        try {
            if (!interaction || !interaction.isRepliable()) {
                console.error(`Ошибка: Интеракция недоступна или не поддерживает ответ. Интеракция: ${interaction?.id}`);
                return;
            }
    
            if (interaction.replied || interaction.deferred) {
                console.log(`Редактирование ответа для взаимодействия с ID: ${interaction.id}`);
                return await interaction.editReply({ content: message });
            } else {
                console.log(`Отправка нового ответа для взаимодействия с ID: ${interaction.id}`);
                return await interaction.reply({ content: message, ephemeral });
            }
        } catch (error) {
            this.handleInteractionError(error, interaction);
        }
    }

    // Безопасное удаление сообщения с улучшенной обработкой ошибок
    async deleteMessageSafely(message: Message): Promise<void> {
        if (message?.deletable) {  // Проверяем, можно ли удалить сообщение
            try {
                console.log(`Попытка удалить сообщение с ID: ${message.id}`);
                await message.delete();  // Пытаемся удалить сообщение
                console.log(`Сообщение с ID: ${message.id} успешно удалено.`);
            } catch (error) {
                this.handleMessageError(error, message);
            }
        } else {
            console.error(`Ошибка: Сообщение с ID: ${message?.id} нельзя удалить или оно не существует.`);
        }
    }

    // Обработка ошибок при взаимодействии
    private handleInteractionError(error: unknown, interaction: CommandInteraction<CacheType>): void {
        if (error instanceof DiscordAPIError) {
            switch (error.code) {
                case 10062:
                    console.error(`Ошибка: Интеракция с ID: ${interaction.id} больше не существует (Unknown Interaction).`);
                    break;
                default:
                    console.error(`Ошибка Discord API (${error.code}) при взаимодействии с ID: ${interaction.id}: ${error.message}`);
            }
        } else {
            console.error(`Неизвестная ошибка при взаимодействии с ID: ${interaction.id}:`, error);
        }
    }

    // Обработка ошибок при удалении сообщения
    private handleMessageError(error: unknown, message: Message): void {
        if (error instanceof DiscordAPIError) {
            switch (error.code) {
                case 10008:
                    console.error(`Ошибка: Сообщение с ID: ${message.id} уже удалено (Unknown Message).`);
                    break;
                default:
                    console.error(`Ошибка Discord API (${error.code}) при удалении сообщения с ID: ${message.id}: ${error.message}`);
            }
        } else {
            console.error(`Неизвестная ошибка при удалении сообщения с ID: ${message.id}:`, error);
        }
    }
}