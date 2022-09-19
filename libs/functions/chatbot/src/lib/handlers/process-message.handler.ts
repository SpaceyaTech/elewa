import { HandlerTools } from '@iote/cqrs';

import { FunctionContext, FunctionHandler, RestResult200 } from '@ngfi/functions';

import { RawMessageData } from '@app/model/convs-mgr/conversations/messages';
import { createMessage } from '../model/create-message.model';
import { ChatBotService } from '../services/main-chatbot.service';
import { NextBlockFactory } from '../services/next-block.factory';
import { ChatBotStore } from '../services/chatbot.store';


export class ProcessMessageHandler extends FunctionHandler<RawMessageData, RestResult200>
{
  /**
   * Incoming message hook from the chat platforms e.g. Whatsapp, Telegram...
   *
   * Registers incoming messages and processes them as readable information in our system.
   */
  public async execute(req: RawMessageData, context: FunctionContext, tools: HandlerTools)
  {
    tools.Logger.log(() => `[ProcessMessageHandler].execute: New incoming chat from channels.`);
    tools.Logger.log(() => JSON.stringify(req));

    await this._processMessage(req, tools)

    return { success: true } as RestResult200;
  }

  private async _processMessage(msg: RawMessageData, tools: HandlerTools)
  {
    tools.Logger.log(() => `[ProcessMessageHandler]._processMessage: Processing message ${JSON.stringify(msg)}.`);

    const chatService =  new ChatBotService(tools.Logger)
    const chatBotRepo$ =  new ChatBotStore(tools)

    const endUser = await chatBotRepo$.getEndUser(msg.phoneNumber)

    if(!endUser)
      tools.Logger.error(()=> `[ProcessMessageHandler]._processMessage - User not registered!`)

    const userActivity =  await chatBotRepo$.getActivity(endUser);

    if(!userActivity){
      return await this._initSession(endUser, chatService, msg, tools)
    } else {
      return await this._nextBlock(endUser, chatBotRepo$, msg, tools)
    }
  }

  /** If a chat session has not yet been recorded on this container, we create a new one and return the first block
   *  
  */
  private async _initSession(endUser: any, chatService: ChatBotService, msg: RawMessageData, tools: HandlerTools)
  {
    const firstBlock = await chatService.init(endUser, tools)

    return firstBlock
  }


  /**
   * Gets the next block and updates the user activity
   * @param endUser 
   * @param chatService 
   * @param msg 
   * @param tools 
   * @returns 
   */
  private async _nextBlock(endUser: any, chatBotRepo$: ChatBotStore, msg: RawMessageData, tools: HandlerTools){
    const latestBlock = await chatBotRepo$.getLatestActivity(endUser)
    const nextBlockService = new NextBlockFactory().resoveBlockType(latestBlock.type, tools)

    const nextBlock = await nextBlockService.getNextBlock(endUser, msg.message, latestBlock)

    const block = await chatBotRepo$.updateActivity(endUser, nextBlock)

    return block;
  }

}
